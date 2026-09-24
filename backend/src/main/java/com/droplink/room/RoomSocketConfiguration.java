package com.droplink.room;

import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import java.net.URI;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocket
class RoomSocketConfiguration implements WebSocketConfigurer {
    private final RoomSocketHandler handler;
    private final String publicOrigin;
    RoomSocketConfiguration(RoomSocketHandler handler, @Value("${droplink.public-origin:}") String publicOrigin) {
        this.handler = handler;
        this.publicOrigin = publicOrigin;
        if (!publicOrigin.isEmpty()) {
            URI uri = URI.create(publicOrigin);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null
                    || !uri.getRawPath().isEmpty() || uri.getRawQuery() != null || uri.getRawFragment() != null
                    || uri.getPort() > 65535 || publicOrigin.contains("*")) {
                throw new IllegalArgumentException("Public origin must be one exact HTTPS origin without a trailing slash");
            }
        }
    }
    @Override public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // Keep Spring's same-origin default. Never allow '*' for private rooms.
        var registration = registry.addHandler(handler, "/api/live");
        // TLS ends at the host proxy. Trust the configured origin, not arbitrary
        // forwarded host/IP headers. Member authentication is still required.
        if (!publicOrigin.isEmpty()) registration.setAllowedOrigins(publicOrigin);
    }
}
