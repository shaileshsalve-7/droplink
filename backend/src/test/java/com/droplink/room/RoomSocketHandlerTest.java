package com.droplink.room;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.*;
import org.springframework.web.socket.*;
import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;
import org.springframework.http.HttpHeaders;
import java.net.URI;
import java.net.InetSocketAddress;
import java.security.Principal;

class RoomSocketHandlerTest {
    MutableClock clock;
    RoomService rooms;
    RoomSocketHandler handler;
    @BeforeEach void setup() {
        clock = new MutableClock(); rooms = new RoomService(clock, new SecureRandom(), Duration.ofMinutes(30), 10, 8);
        handler = new RoomSocketHandler(rooms, clock);
    }
    @AfterEach void close() { handler.shutdown(); }
    class Peer {
        WebSocketSession session = new StubSession(this);
        List<Integer> closes = new CopyOnWriteArrayList<>();
        List<String> messages = new CopyOnWriteArrayList<>();
        Peer() throws Exception {
            handler.afterConnectionEstablished(session);
        }
        void auth(RoomService.Membership member) {
            handler.handleTextMessage(session, new TextMessage("{\"type\":\"auth\",\"roomId\":\"" + member.room().id() + "\",\"token\":\"" + member.memberToken() + "\"}"));
        }
        void ready() { await().atMost(Duration.ofSeconds(2)).untilAsserted(() -> assertThat(messages).anyMatch(m -> m.contains("ready"))); }
    }
    // A small interface fake avoids JVM instrumentation/attach requirements.
    private static class StubSession implements WebSocketSession {
        final Peer peer;
        final String id = UUID.randomUUID().toString();
        StubSession(Peer peer) { this.peer = peer; }
        public String getId() { return id; }
        public URI getUri() { return URI.create("ws://localhost/api/live"); }
        public HttpHeaders getHandshakeHeaders() { return new HttpHeaders(); }
        public Map<String, Object> getAttributes() { return Map.of(); }
        public Principal getPrincipal() { return null; }
        public InetSocketAddress getLocalAddress() { return null; }
        public InetSocketAddress getRemoteAddress() { return null; }
        public String getAcceptedProtocol() { return null; }
        public void setTextMessageSizeLimit(int limit) {}
        public int getTextMessageSizeLimit() { return 1024; }
        public void setBinaryMessageSizeLimit(int limit) {}
        public int getBinaryMessageSizeLimit() { return 1024; }
        public List<WebSocketExtension> getExtensions() { return List.of(); }
        public void sendMessage(WebSocketMessage<?> message) { peer.messages.add((String) message.getPayload()); }
        public boolean isOpen() { return peer.closes.isEmpty(); }
        public void close() { close(CloseStatus.NORMAL); }
        public void close(CloseStatus status) { peer.closes.add(status.getCode()); }
    }
    @Test void expiryClosesSocketWithoutWaitingForRoomCleanup() throws Exception {
        var member = rooms.create(); var peer = new Peer(); peer.auth(member); peer.ready();
        clock.advance(Duration.ofMinutes(30)); handler.tick();
        await().atMost(Duration.ofSeconds(2)).untilAsserted(() -> assertThat(peer.closes).contains(4404));
    }
    @Test void twoSocketsPerMemberAreAllowedButThirdIsRejected() throws Exception {
        var member = rooms.create(); var first = new Peer(); first.auth(member); first.ready();
        var second = new Peer(); second.auth(member); second.ready(); var third = new Peer(); third.auth(member);
        assertThat(third.closes).contains(1013); assertThat(first.closes).isEmpty();
    }
    @Test void missingHeartbeatIsClosedAndPongDoesNotExtendRoomExpiry() throws Exception {
        var member = rooms.create(); var peer = new Peer(); peer.auth(member); peer.ready();
        clock.advance(Duration.ofSeconds(46)); handler.tick();
        await().atMost(Duration.ofSeconds(2)).untilAsserted(() -> assertThat(peer.closes).contains(1011));
        var second = new Peer(); second.auth(member); second.ready();
        clock.advance(Duration.ofMinutes(30)); handler.handleTextMessage(second.session, new TextMessage("{\"type\":\"pong\"}")); handler.tick();
        await().atMost(Duration.ofSeconds(2)).untilAsserted(() -> assertThat(second.closes).contains(4404));
    }
    @Test void totalSocketCountIsBounded() throws Exception {
        for (int i = 0; i < 128; i++) new Peer();
        var extra = new Peer(); assertThat(extra.closes).contains(1013);
    }
}
