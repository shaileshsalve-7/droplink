package com.droplink.room;

import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice(assignableTypes = {RoomController.class, FileController.class})
class RoomErrors {
    @ExceptionHandler(RoomException.class)
    ResponseEntity<ApiError> roomFailure(RoomException error) {
        return ResponseEntity.status(error.status).body(new ApiError(error.code, error.getMessage()));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    ResponseEntity<ApiError> invalidRequest(Exception ignored) {
        return ResponseEntity.badRequest().body(new ApiError("INVALID_REQUEST", "Check the room code and request format."));
    }

    record ApiError(String code, String message) {}

}
