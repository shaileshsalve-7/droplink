package com.droplink;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// Finds components below com.droplink and configures the embedded HTTP server.
@SpringBootApplication
public class DropLinkApplication {
    public static void main(String[] args) {
        SpringApplication.run(DropLinkApplication.class, args);
    }
}
