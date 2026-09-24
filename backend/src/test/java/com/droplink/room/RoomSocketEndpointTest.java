package com.droplink.room;

import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "droplink.files.directory=${java.io.tmpdir}/droplink-test-${random.uuid}")
class RoomSocketEndpointTest {
    @Autowired Environment environment;
    @Autowired RoomService rooms;
    private final HttpClient http = HttpClient.newHttpClient();
    private final JsonMapper json = JsonMapper.builder().build();
    String base() { return "http://127.0.0.1:" + environment.getRequiredProperty("local.server.port"); }
    Peer connect(RoomService.Membership member) throws Exception {
        Peer peer = new Peer();
        peer.socket = http.newWebSocketBuilder().header("Origin", base()).connectTimeout(Duration.ofSeconds(3))
                .buildAsync(URI.create(base().replace("http:", "ws:") + "/api/live"), peer).get(3, TimeUnit.SECONDS);
        if (member != null) peer.socket.sendText(json.writeValueAsString(new Auth("auth", member.room().id().toString(), member.memberToken())), true).join();
        return peer;
    }
    @Test void onlySameRoomMembersReceiveUploadEventsAndHttpRemainsAuthoritative() throws Exception {
        var host = rooms.create(); var guest = rooms.join(host.room().code()); var outsider = rooms.create();
        try (var a = connect(host); var b = connect(guest); var c = connect(outsider)) {
            a.next("ready"); b.next("ready"); c.next("ready");
            String body = "--room-test\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.txt\"\r\n\r\nhello\r\n--room-test--\r\n";
            var upload = HttpRequest.newBuilder(URI.create(base() + "/api/rooms/" + host.room().id() + "/files"))
                    .header("Authorization", "Bearer " + host.memberToken()).header("Content-Type", "multipart/form-data; boundary=room-test")
                    .POST(HttpRequest.BodyPublishers.ofString(body)).build();
            assertThat(http.send(upload, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(201);
            assertThat(a.next("files_changed")).isEqualTo("{\"type\":\"files_changed\"}");
            b.next("files_changed");
            assertThat(c.messages.poll(700, TimeUnit.MILLISECONDS)).isNull();
            var list = HttpRequest.newBuilder(URI.create(base() + "/api/rooms/" + host.room().id() + "/files"))
                    .header("Authorization", "Bearer " + guest.memberToken()).GET().build();
            assertThat(http.send(list, HttpResponse.BodyHandlers.ofString()).body()).contains("a.txt");
        }
    }
    @Test void joinsUpdateCountAndLeavingClosesOnlyTheRevokedMember() throws Exception {
        var host = rooms.create();
        try (var a = connect(host)) {
            a.next("ready"); var guest = rooms.join(host.room().code());
            assertThat(json.readTree(a.next("room_changed")).path("room").path("memberCount").asInt()).isEqualTo(2);
            try (var b = connect(guest)) {
                b.next("ready"); rooms.leave(host.room().id(), guest.memberToken());
                assertThat(b.closed.get(3, TimeUnit.SECONDS)).isEqualTo(4404);
                assertThat(json.readTree(a.next("room_changed")).path("room").path("memberCount").asInt()).isEqualTo(1);
                assertThat(a.closed.isDone()).isFalse();
            }
        }
    }
    @Test void unauthenticatedSocketTimesOutWithoutReceivingRoomData() throws Exception {
        try (var peer = connect(null)) {
            assertThat(peer.closed.get(7, TimeUnit.SECONDS)).isEqualTo(1008);
            assertThat(peer.messages).isEmpty();
        }
    }
    @Test void invalidTokenAndMalformedMessagesAreRejected() throws Exception {
        var host = rooms.create();
        try (var bad = connect(new RoomService.Membership(host.room(), "x".repeat(43)))) {
            assertThat(bad.closed.get(3, TimeUnit.SECONDS)).isEqualTo(4404); assertThat(bad.messages).isEmpty();
        }
        try (var malformed = connect(null)) {
            malformed.socket.sendText("{", true).join(); assertThat(malformed.closed.get(3, TimeUnit.SECONDS)).isEqualTo(1008);
        }
        try (var binary = connect(null)) {
            binary.socket.sendBinary(java.nio.ByteBuffer.wrap(new byte[]{1}), true).join();
            assertThat(binary.closed.get(3, TimeUnit.SECONDS)).isEqualTo(1003);
        }
    }
    @Test void unrelatedBrowserOriginCannotUpgrade() {
        var future = http.newWebSocketBuilder().header("Origin", "https://unrelated.example")
                .buildAsync(URI.create(base().replace("http:", "ws:") + "/api/live"), new Peer());
        assertThatThrownBy(() -> future.get(3, TimeUnit.SECONDS)).hasCauseInstanceOf(WebSocketHandshakeException.class);
    }
    private record Auth(String type, String roomId, String token) {}
    private static class Peer implements WebSocket.Listener, AutoCloseable {
        WebSocket socket;
        final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        final CompletableFuture<Integer> closed = new CompletableFuture<>();
        final StringBuilder buffer = new StringBuilder();
        @Override public void onOpen(WebSocket socket) { socket.request(Long.MAX_VALUE); }
        @Override public CompletionStage<?> onText(WebSocket socket, CharSequence text, boolean last) {
            buffer.append(text); if (last) { messages.add(buffer.toString()); buffer.setLength(0); } return null;
        }
        @Override public CompletionStage<?> onClose(WebSocket socket, int code, String reason) { closed.complete(code); return null; }
        @Override public void onError(WebSocket socket, Throwable error) { closed.completeExceptionally(error); }
        String next(String type) throws Exception {
            String message = messages.poll(3, TimeUnit.SECONDS);
            assertThat(message).isNotNull().contains("\"type\":\"" + type + "\""); return message;
        }
        @Override public void close() { if (socket != null) socket.abort(); }
    }
}
