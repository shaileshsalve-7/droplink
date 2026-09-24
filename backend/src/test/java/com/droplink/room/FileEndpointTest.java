package com.droplink.room;

import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "droplink.files.directory=${java.io.tmpdir}/droplink-test-${random.uuid}")
class FileEndpointTest {
    @Autowired Environment environment;
    @Autowired RoomService rooms;
    private final HttpClient client = HttpClient.newHttpClient();
    private final JsonMapper mapper = JsonMapper.builder().build();
    HttpResponse<byte[]> request(String method, String path, String token, byte[] body, String type) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + environment.getRequiredProperty("local.server.port") + path))
                .timeout(Duration.ofSeconds(10));
        if (token != null) request.header("Authorization", "Bearer " + token);
        if (type != null) request.header("Content-Type", type);
        return client.send(request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(body)).build(), HttpResponse.BodyHandlers.ofByteArray());
    }
    byte[] multipart(byte[] content) {
        byte[] head = "--drop-test\r\nContent-Disposition: form-data; name=\"file\"; filename=\"notes.html\"\r\nContent-Type: text/html\r\n\r\n".getBytes(StandardCharsets.UTF_8);
        byte[] tail = "\r\n--drop-test--\r\n".getBytes(StandardCharsets.UTF_8);
        byte[] result = new byte[head.length + content.length + tail.length];
        System.arraycopy(head, 0, result, 0, head.length);
        System.arraycopy(content, 0, result, head.length, content.length);
        System.arraycopy(tail, 0, result, head.length + content.length, tail.length);
        return result;
    }
    @Test void memberUploadListAndAttachmentDownloadPreserveBytes() throws Exception {
        var host = rooms.create(); var guest = rooms.join(host.room().code());
        String path = "/api/rooms/" + host.room().id() + "/files";
        byte[] original = "<p>download only</p>".getBytes(StandardCharsets.UTF_8);
        var upload = request("POST", path, host.memberToken(), multipart(original), "multipart/form-data; boundary=drop-test");
        assertThat(upload.statusCode()).isEqualTo(201);
        var file = mapper.readValue(upload.body(), FileStorageService.FileView.class);
        var listing = request("GET", path, guest.memberToken(), null, null);
        assertThat(listing.statusCode()).isEqualTo(200);
        assertThat(new String(listing.body(), StandardCharsets.UTF_8)).contains(file.id().toString()).doesNotContain("memberToken", ".blob");
        var downloaded = request("GET", path + "/" + file.id(), guest.memberToken(), null, null);
        assertThat(downloaded.statusCode()).isEqualTo(200);
        assertThat(downloaded.body()).isEqualTo(original);
        assertThat(downloaded.headers().firstValue("content-type")).contains("application/octet-stream");
        assertThat(downloaded.headers().firstValue("content-disposition").orElseThrow()).startsWith("attachment;");
        assertThat(downloaded.headers().firstValue("cache-control")).contains("no-store");
        assertThat(downloaded.headers().firstValue("x-content-type-options")).contains("nosniff");
    }
    @Test void unauthorizedMultipartIsRejectedBeforeParsingAndCannotListOrDownload() throws Exception {
        var host = rooms.create(); String path = "/api/rooms/" + host.room().id() + "/files";
        assertThat(request("POST", path, null, new byte[]{1}, "multipart/form-data; boundary=broken").statusCode()).isEqualTo(404);
        assertThat(request("GET", path, "x".repeat(43), null, null).statusCode()).isEqualTo(404);
        assertThat(request("GET", path + "/" + UUID.randomUUID(), null, null, null).statusCode()).isEqualTo(404);
    }
    @Test void actualServletLimitAndMalformedMultipartReturnSafeErrors() throws Exception {
        var host = rooms.create(); String path = "/api/rooms/" + host.room().id() + "/files";
        var tooLarge = request("POST", path, host.memberToken(), multipart(new byte[(int) FileStorageService.MAX_FILE + 1]), "multipart/form-data; boundary=drop-test");
        assertThat(tooLarge.statusCode()).isEqualTo(413);
        assertThat(new String(tooLarge.body(), StandardCharsets.UTF_8)).contains("FILE_TOO_LARGE").doesNotContain("Exception");
        var malformed = request("POST", path, host.memberToken(), "--drop-test--\r\n".getBytes(StandardCharsets.UTF_8), "multipart/form-data; boundary=drop-test");
        assertThat(malformed.statusCode()).isEqualTo(400);
        assertThat(new String(malformed.body(), StandardCharsets.UTF_8)).contains("INVALID_UPLOAD");
    }
    @Test void multipartOnOtherRoutesIsRejectedBeforeParsing() throws Exception {
        var host = rooms.create();
        String files = "/api/rooms/" + host.room().id() + "/files";
        for (String path : new String[]{"/api/rooms", "/api/rooms/join", files + "/", files + "/" + UUID.randomUUID(), "/api/health", "/unknown"}) {
            var response = request("POST", path, host.memberToken(), multipart(new byte[]{1}), "multipart/form-data; boundary=drop-test");
            assertThat(response.statusCode()).as(path).isEqualTo(415);
            assertThat(new String(response.body(), StandardCharsets.UTF_8)).contains("INVALID_UPLOAD");
        }
        // Even an unparsable body must stop at the filter, not multipart parsing.
        var malformed = request("GET", files, host.memberToken(), new byte[]{1}, "multipart/form-data");
        assertThat(malformed.statusCode()).isEqualTo(415);
        assertThat(new String(malformed.body(), StandardCharsets.UTF_8)).contains("INVALID_UPLOAD");
        assertThat(malformed.headers().firstValue("cache-control")).contains("no-store");
    }
}
