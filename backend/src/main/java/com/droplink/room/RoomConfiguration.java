package com.droplink.room;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
class RoomConfiguration {
    // Injecting time lets tests reach expiry immediately without sleeping.
    @Bean
    Clock roomClock() { return Clock.systemUTC(); }

    @Bean
    RoomService roomService(Clock clock,
            @Value("${droplink.rooms.ttl:PT30M}") Duration ttl,
            @Value("${droplink.rooms.max-rooms:100}") int maxRooms,
            @Value("${droplink.rooms.max-members:8}") int maxMembers) {
        return new RoomService(clock, new SecureRandom(), ttl, maxRooms, maxMembers);
    }
}
