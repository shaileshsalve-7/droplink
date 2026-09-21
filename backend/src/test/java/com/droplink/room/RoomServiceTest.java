package com.droplink.room;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.ArrayList;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class RoomServiceTest {
    private final MutableClock clock = new MutableClock();
    private final RoomService rooms = new RoomService(clock, new SecureRandom(), Duration.ofMinutes(30), 2, 3);

    @Test void credentialsAreDistinctAndCannotCrossRooms() {
        var host = rooms.create();
        var guest = rooms.join(host.room().code().toLowerCase());
        var other = rooms.create();
        assertThat(host.room().code()).matches("[A-HJ-NP-Z2-9]{8}");
        assertThat(guest.room().id()).isEqualTo(host.room().id());
        assertThat(guest.memberToken()).hasSize(43).isNotEqualTo(host.memberToken());
        assertThat(rooms.inspect(host.room().id(), host.memberToken()).memberCount()).isEqualTo(2);
        assertThatThrownBy(() -> rooms.inspect(other.room().id(), guest.memberToken())).isInstanceOf(RoomException.class);
    }
    @Test void expiresAtExactBoundaryWithoutExtendingOnJoin() {
        var host = rooms.create();
        clock.advance(Duration.ofMinutes(29));
        var guest = rooms.join(host.room().code());
        assertThat(guest.room().expiresAt()).isEqualTo(host.room().expiresAt());
        clock.advance(Duration.ofMinutes(1));
        assertThatThrownBy(() -> rooms.inspect(host.room().id(), host.memberToken())).isInstanceOf(RoomException.class);
        assertThatThrownBy(() -> rooms.join(host.room().code())).isInstanceOf(RoomException.class);
    }
    @Test void leaveRevokesOnlyThatMemberAndLastLeaveRemovesRoom() {
        var host = rooms.create();
        var guest = rooms.join(host.room().code());
        rooms.leave(host.room().id(), host.memberToken());
        assertThatThrownBy(() -> rooms.inspect(host.room().id(), host.memberToken())).isInstanceOf(RoomException.class);
        assertThat(rooms.inspect(guest.room().id(), guest.memberToken()).memberCount()).isEqualTo(1);
        rooms.leave(guest.room().id(), guest.memberToken());
        assertThatThrownBy(() -> rooms.join(guest.room().code())).isInstanceOf(RoomException.class);
    }
    @Test void cleanupReclaimsRoomCapacity() {
        rooms.create(); rooms.create();
        assertThatThrownBy(rooms::create).isInstanceOf(RoomException.class).hasMessageContaining("full");
        clock.advance(Duration.ofMinutes(30));
        rooms.removeExpired();
        assertThat(rooms.create().room().memberCount()).isEqualTo(1);
    }
    @Test void validatesCodesAndAcceptsDisplayFormatting() {
        var room = rooms.create();
        String code = room.room().code();
        assertThat(rooms.join(" " + code.substring(0, 4) + "-" + code.substring(4) + " ").room().id()).isEqualTo(room.room().id());
        for (String invalid : new String[] {"", "123", "OOOOOOOO", "<script>", "A".repeat(100)})
            assertThatThrownBy(() -> rooms.join(invalid)).isInstanceOf(RoomException.class).hasMessageContaining("eight-character");
        assertThatThrownBy(() -> rooms.join(null)).isInstanceOf(RoomException.class);
    }
    @Test void concurrentJoinsRespectCapacity() throws Exception {
        var host = rooms.create();
        assertThat(concurrentAdmissions(() -> rooms.join(host.room().code()), "ROOM_FULL")).isEqualTo(2);
        assertThat(rooms.inspect(host.room().id(), host.memberToken()).memberCount()).isEqualTo(3);
    }
    @Test void concurrentCreatesRespectCapacity() throws Exception {
        assertThat(concurrentAdmissions(rooms::create, "ROOM_CAPACITY")).isEqualTo(2);
    }
    private int concurrentAdmissions(Callable<RoomService.Membership> action, String errorCode) throws Exception {
        var pool = Executors.newFixedThreadPool(8);
        try {
            var tasks = new ArrayList<Callable<Boolean>>();
            for (int i = 0; i < 20; i++) tasks.add(() -> {
                try { action.call(); return true; }
                catch (RoomException e) { assertThat(e.code).isEqualTo(errorCode); return false; }
            });
            int admitted = 0;
            for (var future : pool.invokeAll(tasks)) if (future.get()) admitted++;
            return admitted;
        } finally { pool.shutdownNow(); }
    }
}
