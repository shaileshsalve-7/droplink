package com.droplink.room;

import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
class RoomRequestFilter extends OncePerRequestFilter {
    private final AdmissionLimiter limiter;
    private final RoomService rooms;
    private final Semaphore uploads = new Semaphore(4);
    RoomRequestFilter(AdmissionLimiter limiter, RoomService rooms) { this.limiter = limiter; this.rooms = rooms; }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        // Servlet path is decoded by the container, matching MVC route handling.
        String path = request.getServletPath();
        if (path.equals("/api/live") || path.equals("/api/rooms") || path.startsWith("/api/rooms/")) {
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("X-Content-Type-Options", "nosniff");
            if (request.getMethod().equals("POST") || path.equals("/api/live")) {
                // Do not trust a caller-supplied X-Forwarded-For header. With the
                // development proxy, all devices share the proxy's peer budget.
                if (!limiter.allow(request.getRemoteAddr())) {
                    response.setStatus(429);
                    response.setHeader("Retry-After", "60");
                    response.setContentType("application/json");
                    response.getWriter().write("{\"code\":\"RATE_LIMITED\",\"message\":\"Too many attempts. Wait one minute and try again.\"}");
                    return;
                }
            }
        }
        // Spring can parse multipart bodies before choosing a controller. Reject
        // them on every other route/method so they cannot bypass the authenticated
        // upload path and its four-request spool budget (including unknown URLs).
        String contentType = request.getContentType();
        if (contentType != null && contentType.stripLeading().regionMatches(true, 0, "multipart/", 0, 10)
                && !(request.getMethod().equals("POST") && path.matches("/api/rooms/[^/]+/files"))) {
            response.setStatus(415);
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.setContentType("application/json");
            response.getWriter().write("{\"code\":\"INVALID_UPLOAD\",\"message\":\"Use the room file upload endpoint.\"}");
            return;
        }
        // Authenticate file requests before Spring parses/spools a multipart body.
        if (path.matches("/api/rooms/[^/]+/files(?:/[^/]+)?")) {
            try {
                rooms.inspect(UUID.fromString(path.split("/")[3]), RoomController.tokenFrom(request.getHeader("Authorization")));
            } catch (IllegalArgumentException | RoomException failure) {
                response.setStatus(404);
                response.setContentType("application/json");
                response.getWriter().write("{\"code\":\"ROOM_UNAVAILABLE\",\"message\":\"Room unavailable.\"}");
                return;
            }
            if (request.getMethod().equals("POST")) {
                if (!uploads.tryAcquire()) {
                    response.setStatus(503);
                    response.setContentType("application/json");
                    response.getWriter().write("{\"code\":\"UPLOAD_BUSY\",\"message\":\"Uploads are busy. Try again shortly.\"}");
                    return;
                }
                try { chain.doFilter(request, response); }
                finally { uploads.release(); }
                return;
            }
        }
        chain.doFilter(request, response);
    }
}
