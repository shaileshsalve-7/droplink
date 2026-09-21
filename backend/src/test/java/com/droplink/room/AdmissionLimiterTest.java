package com.droplink.room;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
class AdmissionLimiterTest {
    @Test void peerBudgetResetsAtWindowBoundary() {
        var clock = new MutableClock();
        var limiter = new AdmissionLimiter(clock);
        for (int i = 0; i < 30; i++) assertThat(limiter.allow("peer-a")).isTrue();
        assertThat(limiter.allow("peer-a")).isFalse();
        assertThat(limiter.allow("peer-b")).isTrue();
        clock.advance(Duration.ofSeconds(60));
        assertThat(limiter.allow("peer-a")).isTrue();
    }
    @Test void globalBudgetCapsDistinctPeers() {
        var limiter = new AdmissionLimiter(new MutableClock());
        for (int i = 0; i < 300; i++) assertThat(limiter.allow("peer-" + i)).isTrue();
        assertThat(limiter.allow("another-peer")).isFalse();
    }
}
