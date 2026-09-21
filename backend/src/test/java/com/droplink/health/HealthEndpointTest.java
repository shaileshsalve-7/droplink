package com.droplink.health;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;

// A random port avoids conflicts with a developer's already-running backend.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class HealthEndpointTest {
    @Autowired
    private Environment environment;

    private HttpResponse<String> get(String path) throws Exception {
        String port = environment.getRequiredProperty("local.server.port");
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(5))
                .GET().build();
        return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void healthIsLiveJsonWithTheExpectedContract() throws Exception {
        var response = get("/api/health");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("content-type").orElse("")).contains("application/json");
        assertThat(response.headers().firstValue("cache-control").orElse("")).contains("no-store");
        // Deserialize the real HTTP response into a typed record using Jackson's builder.
        var body = JsonMapper.builder().build()
                .readValue(response.body(), HealthController.HealthResponse.class);
        assertThat(body.service()).isEqualTo("droplink");
        assertThat(body.status()).isEqualTo("UP");
    }

    @Test
    void unimplementedRoomsDoNotReturnFakeSuccess() throws Exception {
        assertThat(get("/api/rooms").statusCode()).isEqualTo(404);
    }
}
