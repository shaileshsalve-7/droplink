package com.droplink.room;

import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
class AdmissionLimiter {
    private final Clock clock;
    private final Map<String, Integer> attempts = new HashMap<>();
    private Instant resetAt = Instant.MIN;
    private int total;

    AdmissionLimiter(Clock clock) { this.clock = clock; }

    synchronized boolean allow(String peer) {
        if (!clock.instant().isBefore(resetAt)) {
            attempts.clear();
            total = 0;
            resetAt = clock.instant().plusSeconds(60);
        }
        // The global bound also bounds this map's memory, even with many peers.
        if (total >= 300) return false;
        total++;
        int count = attempts.getOrDefault(peer, 0);
        if (count >= 30) return false;
        attempts.put(peer, count + 1);
        return true;
    }
}
