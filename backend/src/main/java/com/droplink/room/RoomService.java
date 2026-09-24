package com.droplink.room;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.scheduling.annotation.Scheduled;

public class RoomService {
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private final Map<UUID, Room> rooms = new HashMap<>();
    private final Clock clock;
    private final SecureRandom random;
    private final Duration ttl;
    private final int maxRooms;
    private final int maxMembers;

    RoomService(Clock clock, SecureRandom random, Duration ttl, int maxRooms, int maxMembers) {
        if (ttl.isNegative() || ttl.isZero() || ttl.compareTo(Duration.ofHours(24)) > 0
                || maxRooms < 1 || maxRooms > 1000 || maxMembers < 2 || maxMembers > 20) {
            throw new IllegalArgumentException("Invalid room limits: TTL > 0 and <= 24h, rooms 1..1000, members 2..20 required.");
        }
        this.clock = clock;
        this.random = random;
        this.ttl = ttl;
        this.maxRooms = maxRooms;
        this.maxMembers = maxMembers;
    }

    // One lock makes checking limits and changing state atomic. This is small,
    // bounded, in-memory work; never put future file I/O inside this lock.
    public synchronized Membership create() {
        removeExpired();
        if (rooms.size() >= maxRooms) {
            throw new RoomException(503, "ROOM_CAPACITY", "The server is full. Try again after a room expires.");
        }
        String code;
        do { code = newCode(); } while (codeExists(code));
        Room room = new Room(UUID.randomUUID(), code, clock.instant().plus(ttl));
        rooms.put(room.id, room);
        return admit(room);
    }

    public synchronized Membership join(String suppliedCode) {
        String code = normalizeCode(suppliedCode);
        removeExpired();
        Room room = rooms.values().stream().filter(r -> r.code.equals(code))
                .findFirst().orElseThrow(RoomException::unavailable);
        if (room.tokens.size() >= maxMembers) {
            throw new RoomException(409, "ROOM_FULL", "This room is full. Leave on another device or create a new room.");
        }
        // Joining never extends the original room lifetime.
        return admit(room);
    }

    public synchronized RoomView inspect(UUID id, String token) {
        return view(requireMember(id, token));
    }

    // Internal cleanup check only; never expose a public room directory.
    synchronized boolean isActive(UUID id) {
        Room room = rooms.get(id);
        return room != null && clock.instant().isBefore(room.expiresAt);
    }

    public synchronized void leave(UUID id, String token) {
        Room room = requireMember(id, token);
        room.tokens.remove(token);
        if (room.tokens.isEmpty()) rooms.remove(id);
    }

    @Scheduled(fixedDelay = 30_000)
    public synchronized void removeExpired() {
        Instant now = clock.instant();
        rooms.values().removeIf(room -> !now.isBefore(room.expiresAt));
    }

    private Room requireMember(UUID id, String token) {
        // Access checks enforce expiry even between scheduled cleanup runs.
        removeExpired();
        Room room = rooms.get(id);
        if (room == null || token == null || !room.tokens.contains(token)) throw RoomException.unavailable();
        return room;
    }

    private Membership admit(Room room) {
        String token;
        do {
            byte[] bytes = new byte[32];
            random.nextBytes(bytes);
            token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        } while (!room.tokens.add(token));
        return new Membership(view(room), token);
    }

    private RoomView view(Room room) {
        return new RoomView(room.id, room.code, room.expiresAt, clock.instant(), room.tokens.size(), maxMembers);
    }

    private boolean codeExists(String code) {
        return rooms.values().stream().anyMatch(room -> room.code.equals(code));
    }

    private String newCode() {
        StringBuilder result = new StringBuilder(8);
        for (int i = 0; i < 8; i++) result.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        return result.toString();
    }

    static String normalizeCode(String supplied) {
        if (supplied == null || supplied.length() > 32) throw invalidCode();
        String code = supplied.strip().toUpperCase(Locale.ROOT).replace(" ", "").replace("-", "");
        if (!code.matches("[A-HJ-NP-Z2-9]{8}")) throw invalidCode();
        return code;
    }

    private static RoomException invalidCode() {
        return new RoomException(400, "INVALID_CODE", "Enter the eight-character room code. Spaces and a hyphen are allowed.");
    }

    private static final class Room {
        final UUID id;
        final String code;
        final Instant expiresAt;
        final Set<String> tokens = new HashSet<>();
        Room(UUID id, String code, Instant expiresAt) {
            this.id = id;
            this.code = code;
            this.expiresAt = expiresAt;
        }
    }

    // Public responses contain no other member's credentials.
    public record RoomView(UUID id, String code, Instant expiresAt, Instant serverTime, int memberCount, int maxMembers) {}
    public record Membership(RoomView room, String memberToken) {}
}
