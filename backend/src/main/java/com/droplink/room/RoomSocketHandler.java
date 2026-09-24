package com.droplink.room;

import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.json.JsonMapper;

@Component
class RoomSocketHandler extends TextWebSocketHandler {
    private final RoomService rooms;
    private final Clock clock;
    private final JsonMapper json = JsonMapper.builder().build();
    private final Map<String, Client> clients = new ConcurrentHashMap<>();
    // Slow network sends cannot block the room/file cleanup scheduler or an upload.
    // Each client can queue at most one task, with a fixed worker/queue bound.
    private final ThreadPoolExecutor senders = new ThreadPoolExecutor(4, 4, 0, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(128), task -> { var thread = new Thread(task, "droplink-live"); thread.setDaemon(true); return thread; });

    RoomSocketHandler(RoomService rooms, Clock clock) { this.rooms = rooms; this.clock = clock; }

    @Override public synchronized void afterConnectionEstablished(WebSocketSession session) throws IOException {
        if (clients.size() >= 128) { session.close(new CloseStatus(1013, "Live updates are busy")); return; }
        session.setTextMessageSizeLimit(1024);
        session.setBinaryMessageSizeLimit(1024);
        clients.put(session.getId(), new Client(new ConcurrentWebSocketSessionDecorator(session, 2000, 8192), clock.instant()));
    }

    @Override protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        Client client = clients.get(session.getId());
        if (client == null) return;
        try {
            if (message.getPayloadLength() > 1024) { close(client, 1009); return; }
            var payload = json.readTree(message.getPayload());
            String type = payload.path("type").asText();
            if (client.token == null) {
                if (!type.equals("auth") || Duration.between(client.connectedAt, clock.instant()).toSeconds() >= 5) {
                    close(client, 1008); return;
                }
                UUID roomId = UUID.fromString(payload.path("roomId").asText());
                String token = RoomController.tokenFrom("Bearer " + payload.path("token").asText());
                rooms.inspect(roomId, token);
                synchronized (this) {
                    // Two sockets allow a reconnect to overlap its old connection.
                    if (clients.values().stream().filter(c -> token.equals(c.token) && roomId.equals(c.roomId)).count() >= 2) {
                        close(client, 1013); return;
                    }
                    client.roomId = roomId;
                    client.token = token; // Volatile publication after roomId.
                }
                client.lastPong = clock.instant();
                enqueue(client);
            } else if (type.equals("pong")) {
                // Pongs never extend room lifetime; every outgoing event rechecks access.
                client.lastPong = clock.instant();
            } else { close(client, 1008); }
        } catch (RoomException failure) { close(client, 4404); }
        catch (RuntimeException failure) { close(client, 1008); }
    }

    @EventListener
    public void filesChanged(RoomFilesChanged event) {
        // Coalesce a burst into one invalidation. The HTTP list is authoritative.
        clients.values().stream().filter(c -> event.roomId().equals(c.roomId)).forEach(c -> c.filesDirty.set(true));
    }

    @Scheduled(fixedDelay = 500)
    public void tick() { clients.values().forEach(this::enqueue); }

    private void enqueue(Client client) {
        if (!client.queued.compareAndSet(false, true)) return;
        try { senders.execute(() -> { try { update(client); } finally { client.queued.set(false); } }); }
        catch (RejectedExecutionException failure) { client.queued.set(false); }
    }

    private void update(Client client) {
        if (!client.session.isOpen()) { clients.remove(client.session.getId(), client); return; }
        Instant now = clock.instant();
        if (client.token == null) {
            if (!now.isBefore(client.connectedAt.plusSeconds(5))) close(client, 1008);
            return;
        }
        try {
            var room = rooms.inspect(client.roomId, client.token);
            if (!now.isBefore(client.lastPong.plusSeconds(45))) { close(client, 1011); return; }
            if (!client.ready) {
                send(client, Map.of("type", "ready", "room", room));
                client.memberCount = room.memberCount(); client.ready = true;
            } else if (client.memberCount != room.memberCount()) {
                send(client, Map.of("type", "room_changed", "room", room));
                client.memberCount = room.memberCount();
            }
            if (client.filesDirty.getAndSet(false)) {
                // Recheck immediately before each private notification too.
                rooms.inspect(client.roomId, client.token);
                send(client, Map.of("type", "files_changed"));
            }
            if (!now.isBefore(client.lastPing.plusSeconds(15))) {
                send(client, Map.of("type", "ping")); client.lastPing = now;
            }
        } catch (RoomException failure) { close(client, 4404); }
        catch (IOException | RuntimeException failure) { close(client, 1011); }
    }

    private void send(Client client, Object value) throws IOException {
        client.session.sendMessage(new TextMessage(json.writeValueAsString(value)));
    }

    private void close(Client client, int code) {
        clients.remove(client.session.getId(), client);
        try { client.session.close(new CloseStatus(code)); } catch (IOException ignored) { /* Already gone. */ }
    }
    @Override public void afterConnectionClosed(WebSocketSession session, CloseStatus status) { clients.remove(session.getId()); }
    @Override public void handleTransportError(WebSocketSession session, Throwable failure) {
        Client client = clients.get(session.getId()); if (client != null) close(client, 1011);
    }
    @PreDestroy void shutdown() { clients.values().forEach(c -> close(c, 1001)); senders.shutdownNow(); }

    private static class Client {
        final WebSocketSession session;
        final Instant connectedAt;
        final AtomicBoolean queued = new AtomicBoolean();
        final AtomicBoolean filesDirty = new AtomicBoolean();
        volatile UUID roomId;
        volatile String token;
        volatile Instant lastPong;
        Instant lastPing;
        int memberCount;
        boolean ready;
        Client(WebSocketSession session, Instant now) {
            this.session = session; connectedAt = now; lastPong = now; lastPing = now;
        }
    }
}
