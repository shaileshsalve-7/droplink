package com.droplink.room;

import jakarta.annotation.PreDestroy;
import java.io.*;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.*;
import java.time.Clock;
import java.time.Instant;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
class FileStorageService {
    static final long MAX_FILE = 10L * 1024 * 1024;
    static final long MAX_ROOM = 50L * 1024 * 1024;
    static final long MAX_TOTAL = 250L * 1024 * 1024;
    static final int MAX_COUNT = 20;
    private static final Logger log = LoggerFactory.getLogger(FileStorageService.class);
    private final RoomService rooms;
    private final Clock clock;
    private final Path root;
    private final FileChannel lockChannel;
    private final FileLock lock;
    private final Map<UUID, StoredFile> entries = new LinkedHashMap<>();
    private boolean closed;

    FileStorageService(RoomService rooms, Clock clock,
            @Value("${droplink.files.directory}") String directory) throws IOException {
        this.rooms = rooms;
        this.clock = clock;
        root = Path.of(directory).toAbsolutePath().normalize();
        Files.createDirectories(root);
        if (Files.isSymbolicLink(root)) throw new IOException("Storage directory must not be a symbolic link.");
        lockChannel = FileChannel.open(root.resolve(".droplink.lock"), StandardOpenOption.CREATE,
                StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS);
        FileLock acquired = null;
        try {
            // Prevent a second process from clearing the first process's files.
            acquired = lockChannel.tryLock();
            if (acquired == null) throw new IOException("DropLink storage is already in use.");
            lock = acquired;
            // Room credentials are in memory. All old blobs are unreachable after
            // a restart, so remove only our own generated filenames, never recurse.
            purgeOwnedFiles();
        } catch (IOException | RuntimeException failure) {
            if (acquired != null) acquired.release();
            lockChannel.close();
            throw failure;
        }
    }

    // File work has its own lock. Room admission never waits inside a room lock
    // for disk I/O. Serial writes keep quota checks simple and atomic for this MVP.
    synchronized FileView upload(UUID roomId, String token, MultipartFile input) {
        var room = rooms.inspect(roomId, token);
        cleanup();
        long size = input.getSize();
        if (size <= 0) throw new RoomException(400, "EMPTY_FILE", "Choose a file that is not empty.");
        if (size > MAX_FILE) throw tooLarge();
        var roomFiles = entries.values().stream().filter(e -> e.roomId().equals(roomId)).toList();
        if (roomFiles.size() >= MAX_COUNT || roomFiles.stream().mapToLong(e -> e.view().size()).sum() + size > MAX_ROOM)
            throw new RoomException(409, "ROOM_STORAGE_FULL", "This room has reached its file limit. Create a new room.");
        if (diskUsage() + size > MAX_TOTAL)
            throw new RoomException(503, "STORAGE_FULL", "Temporary storage is full. Try again after rooms expire.");
        UUID id = UUID.randomUUID();
        Path path = root.resolve(id + ".blob");
        var view = new FileView(id, safeName(input.getOriginalFilename()), size, clock.instant(), room.expiresAt());
        try {
            // Limit the actual stream too; never trust metadata alone or load a
            // whole upload into the Java heap. Partial files are never listed.
            try (InputStream source = input.getInputStream(); OutputStream target = Files.newOutputStream(path,
                    StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                byte[] buffer = new byte[16 * 1024];
                long copied = 0;
                int count;
                while ((count = source.read(buffer)) != -1) {
                    copied += count;
                    if (copied > size || copied > MAX_FILE) throw tooLarge();
                    target.write(buffer, 0, count);
                }
                if (copied != size) throw new RoomException(400, "INVALID_UPLOAD", "The upload was incomplete. Try again.");
            }
            // Expiry or leaving during the copy must not publish a new file.
            rooms.inspect(roomId, token);
            entries.put(id, new StoredFile(roomId, view, path));
            return view;
        } catch (IOException failure) {
            discard(path);
            throw storageFailure();
        } catch (RuntimeException failure) {
            discard(path);
            throw failure;
        }
    }

    synchronized List<FileView> list(UUID roomId, String token) {
        rooms.inspect(roomId, token);
        return entries.values().stream().filter(e -> e.roomId().equals(roomId)).map(StoredFile::view).toList();
    }

    synchronized Download download(UUID roomId, String token, UUID fileId) {
        rooms.inspect(roomId, token);
        StoredFile entry = entries.get(fileId);
        if (entry == null || !entry.roomId().equals(roomId))
            throw new RoomException(404, "FILE_UNAVAILABLE", "This file is no longer available.");
        try {
            // Open before releasing the storage lock; Spring closes the stream
            // after sending. A download started before expiry may finish afterward.
            return new Download(entry.view(), Files.newInputStream(entry.path(), LinkOption.NOFOLLOW_LINKS));
        } catch (IOException failure) { throw storageFailure(); }
    }

    @Scheduled(fixedDelay = 30_000)
    synchronized void cleanup() {
        if (closed) return;
        var iterator = entries.values().iterator();
        while (iterator.hasNext()) {
            StoredFile entry = iterator.next();
            if (!rooms.isActive(entry.roomId()) && discard(entry.path())) iterator.remove();
        }
        // Retry failed deletion of incomplete uploads as well as expired blobs.
        try (var paths = Files.list(root)) {
            paths.filter(this::owned).filter(p -> entries.values().stream().noneMatch(e -> e.path().equals(p)))
                    .forEach(this::discard);
        } catch (IOException failure) { log.warn("Temporary file cleanup could not scan storage; it will retry."); }
    }

    private boolean owned(Path path) {
        return path.getFileName().toString().matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\\.blob");
    }

    private long diskUsage() {
        try (var paths = Files.list(root)) {
            long total = 0;
            for (Path path : paths.filter(this::owned).toList()) total += Files.size(path);
            return total;
        } catch (IOException failure) { throw storageFailure(); }
    }

    private void purgeOwnedFiles() throws IOException {
        try (var paths = Files.list(root)) {
            for (Path path : paths.filter(this::owned).toList()) Files.deleteIfExists(path);
        }
    }

    private boolean discard(Path path) {
        try { Files.deleteIfExists(path); return true; }
        catch (IOException failure) { log.warn("Temporary file deletion failed; cleanup will retry."); return false; }
    }

    @PreDestroy
    synchronized void close() throws IOException {
        if (closed) return;
        closed = true;
        try { purgeOwnedFiles(); }
        finally { lock.release(); lockChannel.close(); }
    }

    static String safeName(String original) {
        if (original == null) return "file";
        // The display name is never a disk path. Drop directories and controls,
        // keep common Unicode names, and bound response/header size.
        String name = original.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}\\p{Cf}<>:\"|?*]", "_").strip();
        if (name.isBlank() || name.equals(".") || name.equals("..")) return "file";
        return name.codePoints().limit(160).collect(StringBuilder::new, StringBuilder::appendCodePoint,
                StringBuilder::append).toString();
    }

    private RoomException tooLarge() { return new RoomException(413, "FILE_TOO_LARGE", "Choose a file up to 10 MiB."); }
    private RoomException storageFailure() { return new RoomException(503, "STORAGE_ERROR", "Temporary storage is unavailable. Try again."); }
    private record StoredFile(UUID roomId, FileView view, Path path) {}
    record FileView(UUID id, String name, long size, Instant uploadedAt, Instant expiresAt) {}
    record Download(FileView file, InputStream stream) {}
}
