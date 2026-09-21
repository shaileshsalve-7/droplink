package com.droplink.health;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

// @RestController serializes the return value as JSON instead of an HTML page.
@RestController
public class HealthController {
    @GetMapping("/api/health")
    public ResponseEntity<HealthResponse> health() {
        // Health must come from a live request, never a cached success.
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new HealthResponse("droplink", "UP"));
    }

    // A record is a small immutable data carrier; Spring converts it to JSON.
    public record HealthResponse(String service, String status) {}
}
