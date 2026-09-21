package com.droplink.room;

// Only deliberately written, non-sensitive messages may reach the browser.
class RoomException extends RuntimeException {
    final int status;
    final String code;

    RoomException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    static RoomException unavailable() {
        // The same response covers a missing room, expired room, or wrong token.
        return new RoomException(404, "ROOM_UNAVAILABLE", "Room unavailable. It may have expired, or your access is no longer valid.");
    }
}
