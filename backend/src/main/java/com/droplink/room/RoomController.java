package com.droplink.room;

import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/rooms")
class RoomController {
    private final RoomService rooms;
    RoomController(RoomService rooms) { this.rooms = rooms; }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    RoomService.Membership create() { return rooms.create(); }

    @PostMapping("/join")
    RoomService.Membership join(@RequestBody JoinRequest request) { return rooms.join(request.code()); }

    @GetMapping("/{id}")
    RoomService.RoomView inspect(@PathVariable UUID id,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return rooms.inspect(id, tokenFrom(authorization));
    }

    @DeleteMapping("/{id}/members/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void leave(@PathVariable UUID id,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        rooms.leave(id, tokenFrom(authorization));
    }

    private String tokenFrom(String header) {
        if (header == null || !header.matches("(?i:Bearer) [A-Za-z0-9_-]{43}")) throw RoomException.unavailable();
        return header.substring(7);
    }

    record JoinRequest(String code) {}
}
