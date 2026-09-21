package com.droplink.room;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RoomEndpointTest {
    @Autowired Environment environment;
    private final HttpClient client = HttpClient.newHttpClient();
    private final JsonMapper mapper = JsonMapper.builder().build();
    private HttpResponse<String> request(String method, String path, String body, String token) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:"
                + environment.getRequiredProperty("local.server.port") + path)).timeout(Duration.ofSeconds(5));
        if (token != null) builder.header("Authorization", "Bearer " + token);
        if (body != null) builder.header("Content-Type", "application/json");
        return client.send(builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
    @Test void twoDeviceFlowProtectsStatusAndRevokesAccess() throws Exception {
        var created = request("POST", "/api/rooms", null, null);
        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(created.headers().firstValue("cache-control")).contains("no-store");
        var host = mapper.readValue(created.body(), RoomService.Membership.class);
        var joined = request("POST", "/api/rooms/join", "{\"code\":\"" + host.room().code() + "\"}", null);
        assertThat(joined.statusCode()).isEqualTo(200);
        var guest = mapper.readValue(joined.body(), RoomService.Membership.class);
        String path = "/api/rooms/" + host.room().id();
        assertThat(request("GET", path, null, null).statusCode()).isEqualTo(404);
        assertThat(request("GET", path, null, "x".repeat(43)).statusCode()).isEqualTo(404);
        var status = request("GET", path, null, host.memberToken());
        assertThat(status.statusCode()).isEqualTo(200);
        assertThat(mapper.readValue(status.body(), RoomService.RoomView.class).memberCount()).isEqualTo(2);
        assertThat(status.body()).doesNotContain("memberToken", guest.memberToken(), host.memberToken());
        assertThat(request("DELETE", path + "/members/me", null, guest.memberToken()).statusCode()).isEqualTo(204);
        assertThat(request("GET", path, null, guest.memberToken()).statusCode()).isEqualTo(404);
        assertThat(request("GET", path, null, host.memberToken()).statusCode()).isEqualTo(200);
    }
    @Test void malformedRequestsReturnSafeJson() throws Exception {
        for (String body : new String[] {"{", "{}", "{\"code\":\"invalid\"}"}) {
            var response = request("POST", "/api/rooms/join", body, null);
            assertThat(response.statusCode()).isEqualTo(400);
            assertThat(response.headers().firstValue("cache-control")).contains("no-store");
            assertThat(response.body()).contains("\"code\"").doesNotContain("stackTrace", "Exception");
        }
        assertThat(request("GET", "/api/rooms/not-a-uuid", null, "x".repeat(43)).statusCode()).isEqualTo(400);
        assertThat(request("POST", "/api/rooms/join", "{\"code\":\"ABCDEFGH\"}", null).statusCode()).isEqualTo(404);
    }
}
