package com.droplink.room;
import java.time.*;
final class MutableClock extends Clock {
    private Instant now = Instant.parse("2026-09-22T12:00:00Z");
    void advance(Duration duration) { now = now.plus(duration); }
    @Override public Instant instant() { return now; }
    @Override public ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now, zone); }
}
