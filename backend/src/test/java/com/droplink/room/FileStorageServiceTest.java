package com.droplink.room;

import java.io.*;
import java.nio.channels.OverlappingFileLockException;
import java.nio.file.*;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import static org.assertj.core.api.Assertions.*;

class FileStorageServiceTest {
    @TempDir Path directory;
    MutableClock clock;
    RoomService rooms;
    FileStorageService files;
    RoomService.Membership host;
    @BeforeEach void setup() throws Exception {
        clock = new MutableClock();
        rooms = new RoomService(clock, new SecureRandom(), Duration.ofMinutes(30), 100, 8);
        files = new FileStorageService(rooms, clock, directory.toString());
        host = rooms.create();
    }
    @AfterEach void close() throws Exception { files.close(); }
    MockMultipartFile input(String name, byte[] bytes) { return new MockMultipartFile("file", name, "application/octet-stream", bytes); }
    FileStorageService.FileView upload(String name, byte[] bytes) { return files.upload(host.room().id(), host.memberToken(), input(name, bytes)); }
    void failure(String code, org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOfSatisfying(RoomException.class, e -> assertThat(e.code).isEqualTo(code));
    }
    long blobs() throws Exception { try (var paths = Files.list(directory)) { return paths.filter(p -> p.toString().endsWith(".blob")).count(); } }

    @Test void requiredTypesRoundTripAndDuplicateNamesKeepDifferentIds() throws Exception {
        var guest = rooms.join(host.room().code());
        byte[] bytes = {0, 1, 2, -1, 13, 10};
        for (String name : List.of("report.pdf", "notes.docx", "photo.png", "archive.zip", "Main.java", "script.html")) {
            var file = upload(name, bytes);
            assertThat(file.expiresAt()).isEqualTo(host.room().expiresAt());
            try (var stream = files.download(host.room().id(), guest.memberToken(), file.id()).stream()) {
                assertThat(stream.readAllBytes()).isEqualTo(bytes);
            }
        }
        var first = upload("report.pdf", bytes);
        var second = upload("report.pdf", bytes);
        assertThat(first.id()).isNotEqualTo(second.id());
        assertThat(files.list(host.room().id(), guest.memberToken())).hasSize(8);
    }
    @Test void roomIsolationAndRevokedTokensProtectAllOperations() {
        var file = upload("a.txt", new byte[]{1});
        var other = rooms.create();
        failure("FILE_UNAVAILABLE", () -> files.download(other.room().id(), other.memberToken(), file.id()));
        failure("ROOM_UNAVAILABLE", () -> files.list(host.room().id(), other.memberToken()));
        failure("ROOM_UNAVAILABLE", () -> files.upload(host.room().id(), other.memberToken(), input("b.txt", new byte[]{2})));
        var guest = rooms.join(host.room().code()); rooms.leave(host.room().id(), guest.memberToken());
        failure("ROOM_UNAVAILABLE", () -> files.download(host.room().id(), guest.memberToken(), file.id()));
    }
    @Test void expiryImmediatelyBlocksAccessAndCleanupDeletesDiskFiles() throws Exception {
        var file = upload("a.pdf", new byte[]{1});
        clock.advance(Duration.ofMinutes(30));
        failure("ROOM_UNAVAILABLE", () -> files.list(host.room().id(), host.memberToken()));
        failure("ROOM_UNAVAILABLE", () -> files.download(host.room().id(), host.memberToken(), file.id()));
        assertThat(blobs()).isEqualTo(1);
        files.cleanup(); assertThat(blobs()).isZero();
    }
    @Test void leavingLastMemberTriggersCleanupButOneMemberLeavingDoesNot() throws Exception {
        var guest = rooms.join(host.room().code()); upload("a", new byte[]{1});
        rooms.leave(host.room().id(), guest.memberToken()); files.cleanup(); assertThat(blobs()).isEqualTo(1);
        rooms.leave(host.room().id(), host.memberToken()); files.cleanup(); assertThat(blobs()).isZero();
    }
    @Test void byteAndCountLimitsAreEnforcedWithoutPartialFiles() throws Exception {
        failure("EMPTY_FILE", () -> upload("empty", new byte[0]));
        failure("FILE_TOO_LARGE", () -> upload("large", new byte[(int) FileStorageService.MAX_FILE + 1]));
        for (int i = 0; i < 20; i++) upload("small", new byte[]{1});
        failure("ROOM_STORAGE_FULL", () -> upload("21st", new byte[]{1}));
        assertThat(blobs()).isEqualTo(20);
    }
    @Test void roomAndGlobalByteQuotasAreEnforced() {
        byte[] tenMiB = new byte[(int) FileStorageService.MAX_FILE];
        for (int room = 0; room < 5; room++) {
            if (room > 0) host = rooms.create();
            for (int i = 0; i < 5; i++) upload("chunk", tenMiB);
            failure("ROOM_STORAGE_FULL", () -> upload("over-room", new byte[]{1}));
        }
        host = rooms.create();
        failure("STORAGE_FULL", () -> upload("over-server", new byte[]{1}));
    }
    @Test void concurrentUploadsCannotOverrunCountQuota() throws Exception {
        for (int i = 0; i < 19; i++) upload("small", new byte[]{1});
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            var tasks = List.<Callable<Boolean>>of(() -> attemptUpload(), () -> attemptUpload());
            int success = 0;
            for (var result : pool.invokeAll(tasks)) if (result.get()) success++;
            assertThat(success).isEqualTo(1);
            assertThat(files.list(host.room().id(), host.memberToken())).hasSize(20);
        } finally { pool.shutdownNow(); }
    }
    boolean attemptUpload() { try { upload("race", new byte[]{1}); return true; } catch (RoomException e) { assertThat(e.code).isEqualTo("ROOM_STORAGE_FULL"); return false; } }
    @Test void failureAndExpiryDuringStreamingLeaveNoPublishedOrPartialFile() throws Exception {
        var broken = new MockMultipartFile("file", "a", "text/plain", new byte[]{1}) {
            @Override public InputStream getInputStream() throws IOException { throw new IOException("simulated disk/input failure"); }
        };
        failure("STORAGE_ERROR", () -> files.upload(host.room().id(), host.memberToken(), broken));
        var expiring = new MockMultipartFile("file", "b", "text/plain", new byte[]{1}) {
            @Override public InputStream getInputStream() { clock.advance(Duration.ofMinutes(30)); return new ByteArrayInputStream(new byte[]{1}); }
        };
        failure("ROOM_UNAVAILABLE", () -> files.upload(host.room().id(), host.memberToken(), expiring));
        assertThat(blobs()).isZero();
    }
    @Test void misleadingSizeIsRejectedAndPartialFileRemoved() throws Exception {
        var dishonest = new MockMultipartFile("file", "a", "text/plain", new byte[]{1, 2}) {
            @Override public long getSize() { return 1; }
        };
        failure("FILE_TOO_LARGE", () -> files.upload(host.room().id(), host.memberToken(), dishonest));
        assertThat(blobs()).isZero();
    }
    @Test void filenamesCannotSelectDiskPathsOrInjectHeaders() throws Exception {
        var file = upload("../../folder\\evil\r\n<script>.html", new byte[]{1});
        assertThat(file.name()).isEqualTo("evil___script_.html");
        assertThat(Files.exists(directory.resolve(file.id() + ".blob"))).isTrue();
        assertThat(FileStorageService.safeName(".." )).isEqualTo("file");
        assertThat(FileStorageService.safeName("x".repeat(300))).hasSize(160);
    }
    @Test void startupCleansOwnedOrphansAndLockPreventsCompetingProcess() throws Exception {
        Path sentinel = directory.resolve("keep.txt"); Files.writeString(sentinel, "unrelated");
        assertThatThrownBy(() -> new FileStorageService(rooms, clock, directory.toString())).isInstanceOf(OverlappingFileLockException.class);
        files.close();
        Files.write(directory.resolve(UUID.randomUUID() + ".blob"), new byte[]{9});
        files = new FileStorageService(rooms, clock, directory.toString());
        assertThat(blobs()).isZero(); assertThat(Files.readString(sentinel)).isEqualTo("unrelated");
    }
}
