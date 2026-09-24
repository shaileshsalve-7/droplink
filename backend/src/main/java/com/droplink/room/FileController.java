package com.droplink.room;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/rooms/{roomId}/files")
class FileController {
    private final FileStorageService files;
    FileController(FileStorageService files) { this.files = files; }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    FileStorageService.FileView upload(@PathVariable UUID roomId,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestPart("file") MultipartFile file) {
        return files.upload(roomId, RoomController.tokenFrom(authorization), file);
    }

    @GetMapping
    List<FileStorageService.FileView> list(@PathVariable UUID roomId,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return files.list(roomId, RoomController.tokenFrom(authorization));
    }

    @GetMapping("/{fileId}")
    ResponseEntity<InputStreamResource> download(@PathVariable UUID roomId, @PathVariable UUID fileId,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        var download = files.download(roomId, RoomController.tokenFrom(authorization), fileId);
        // Always download opaque bytes. Never render uploaded HTML, SVG or code.
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM)
                .contentLength(download.file().size())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(download.file().name(), StandardCharsets.UTF_8).build().toString())
                .body(new InputStreamResource(download.stream()));
    }
}
