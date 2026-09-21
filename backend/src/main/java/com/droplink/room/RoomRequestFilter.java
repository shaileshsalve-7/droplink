package com.droplink.room;

import java.io.IOException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
class RoomRequestFilter extends OncePerRequestFilter {
    private final AdmissionLimiter limiter;
    RoomRequestFilter(AdmissionLimiter limiter) { this.limiter = limiter; }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        if (path.equals("/api/rooms") || path.startsWith("/api/rooms/")) {
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("X-Content-Type-Options", "nosniff");
            if (request.getMethod().equals("POST")) {
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
        chain.doFilter(request, response);
    }
}
