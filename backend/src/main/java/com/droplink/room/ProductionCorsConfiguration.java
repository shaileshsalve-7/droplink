package com.droplink.room;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

@Configuration
@Profile("production")
class ProductionCorsConfiguration {
    @Bean
    FilterRegistrationBean<CorsFilter> frontendCors(@Value("${droplink.public-origin}") String origin) {
        // Run preflight handling BEFORE the member-token upload filter. A
        // preflight has no bearer token; the following real request still needs it.
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(List.of(origin));
        cors.setAllowedMethods(List.of("GET", "POST", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Accept", "Content-Type", "Authorization"));
        cors.setAllowCredentials(false); // Tokens use explicit headers, not cookies.
        cors.setMaxAge(600L);
        var source = new UrlBasedCorsConfigurationSource();
        // Socket handshakes are governed by RoomSocketConfiguration, not CORS.
        source.registerCorsConfiguration("/api/rooms/**", cors);
        source.registerCorsConfiguration("/api/health", cors);
        var filter = new FilterRegistrationBean<>(new CorsFilter(source));
        filter.addUrlPatterns("/api/rooms", "/api/rooms/*", "/api/health");
        filter.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return filter;
    }
}
