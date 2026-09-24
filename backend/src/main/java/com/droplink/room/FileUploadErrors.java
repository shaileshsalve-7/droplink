package com.droplink.room;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

// Multipart parsing can fail before Spring selects a controller. This advice
// must be global to give oversized/malformed uploads a predictable JSON error.
@RestControllerAdvice
class FileUploadErrors {
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<RoomErrors.ApiError> oversized(MaxUploadSizeExceededException ignored) {
        return ResponseEntity.status(413).body(new RoomErrors.ApiError("FILE_TOO_LARGE", "Choose a file up to 10 MiB."));
    }

    @ExceptionHandler({MultipartException.class, MissingServletRequestPartException.class})
    ResponseEntity<RoomErrors.ApiError> malformedUpload(Exception ignored) {
        return ResponseEntity.badRequest().body(new RoomErrors.ApiError("INVALID_UPLOAD", "Choose one file and try again."));
    }
}
