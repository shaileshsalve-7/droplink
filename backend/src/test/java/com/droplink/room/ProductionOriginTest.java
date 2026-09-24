package com.droplink.room;

import java.net.URI;
import java.net.http.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.test.context.ActiveProfiles;
import static org.assertj.core.api.Assertions.*;

@ActiveProfiles("production")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "droplink.public-origin=https://droplink.example",
        "server.address=127.0.0.1",
        "droplink.files.directory=${java.io.tmpdir}/droplink-test-${random.uuid}"})
class ProductionOriginTest {
    @Autowired Environment environment;
    private final HttpClient http = HttpClient.newHttpClient();
    URI socketUri() {
        return URI.create("ws://127.0.0.1:" + environment.getRequiredProperty("local.server.port") + "/api/live");
    }

    @Test void configuredHttpsOriginCanUpgradeAcrossTlsTerminatingProxy() throws Exception {
        var socket = http.newWebSocketBuilder().header("Origin", "https://droplink.example")
                .buildAsync(socketUri(), new WebSocket.Listener() {}).get(3, TimeUnit.SECONDS);
        // Upgrade does not authenticate membership; the existing auth suite covers that boundary.
        socket.abort();
    }

    @Test void unrelatedOriginCannotUseForwardedHeadersToUpgrade() {
        var attempt = http.newWebSocketBuilder().header("Origin", "https://unrelated.example")
                .header("X-Forwarded-Host", "unrelated.example").header("X-Forwarded-Proto", "https")
                .buildAsync(socketUri(), new WebSocket.Listener() {});
        assertThatThrownBy(() -> attempt.get(3, TimeUnit.SECONDS))
                .hasCauseInstanceOf(WebSocketHandshakeException.class);
    }

    @Test void unsafePublicOriginConfigurationFailsClosed() {
        for (String origin : new String[]{"*", "https://*.example", "http://droplink.example",
                "https://droplink.example/", "https://droplink.example/path", "https://user@droplink.example",
                "https://droplink.example?key=value", "https://droplink.example#fragment"}) {
            assertThatThrownBy(() -> new RoomSocketConfiguration(null, origin))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test void netlifyPreflightPassesBeforeAuthenticationButRealFileAccessStillRequiresToken() throws Exception {
        String base = "http://127.0.0.1:" + environment.getRequiredProperty("local.server.port");
        var file = URI.create(base + "/api/rooms/00000000-0000-0000-0000-000000000000/files");
        var preflight = HttpRequest.newBuilder(file).method("OPTIONS", HttpRequest.BodyPublishers.noBody())
                .header("Origin", "https://droplink.example")
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "authorization,content-type").build();
        var allowed = http.send(preflight, HttpResponse.BodyHandlers.ofString());
        assertThat(allowed.statusCode()).isEqualTo(200);
        assertThat(allowed.headers().firstValue("Access-Control-Allow-Origin")).contains("https://droplink.example");
        var noToken = http.send(HttpRequest.newBuilder(file).header("Origin", "https://droplink.example").GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(noToken.statusCode()).isEqualTo(404);
        assertThat(noToken.headers().firstValue("Access-Control-Allow-Origin")).contains("https://droplink.example");
    }

    @Test void unrelatedFrontendCannotReadApiOrPassPreflight() throws Exception {
        String base = "http://127.0.0.1:" + environment.getRequiredProperty("local.server.port");
        for (String method : new String[]{"GET", "OPTIONS"}) {
            var request = HttpRequest.newBuilder(URI.create(base + "/api/health"))
                    .method(method, HttpRequest.BodyPublishers.noBody()).header("Origin", "https://unrelated.example");
            if (method.equals("OPTIONS")) request.header("Access-Control-Request-Method", "GET");
            var response = http.send(request.build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(403);
            assertThat(response.headers().firstValue("Access-Control-Allow-Origin")).isEmpty();
        }
    }
}
