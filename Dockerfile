# Build tools stay out of the runtime image. Both suites must pass to build.
FROM node:24-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm test && npm run build

FROM eclipse-temurin:17-jdk-jammy AS backend
WORKDIR /build/backend
COPY backend/ ./
COPY --from=frontend /build/frontend/dist /build/frontend/dist
RUN chmod +x mvnw && ./mvnw -B -Pproduction clean package

FROM eclipse-temurin:17-jre-jammy AS runtime
WORKDIR /app
RUN groupadd --gid 10001 droplink && useradd --uid 10001 --gid droplink --no-create-home droplink \
    && mkdir /app/files && chown droplink:droplink /app/files
COPY --from=backend /build/backend/target/droplink-0.1.0-SNAPSHOT.jar /app/droplink.jar
USER 10001:10001
ENV SPRING_PROFILES_ACTIVE=production \
    SERVER_ADDRESS=0.0.0.0 \
    PORT=10000 \
    DROPLINK_STORAGE_DIR=/app/files \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=50 -XX:+ExitOnOutOfMemoryError"
EXPOSE 10000
ENTRYPOINT ["java", "-jar", "/app/droplink.jar"]
