# ── Stage 1: Dashboard Builder ──────────────────────────────────
FROM node:20-slim AS dashboard-builder

WORKDIR /build

# Copy dashboard source
COPY src/dashboard/package*.json ./src/dashboard/
COPY src/dashboard/ ./src/dashboard/

# Build dashboard
WORKDIR /build/src/dashboard
RUN npm ci && npm run build


# ── Stage 2: Commander Builder ──────────────────────────────────
FROM node:20-slim AS commander-builder

WORKDIR /build

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (needed for tsx at runtime)
RUN npm ci

# Copy source
COPY src/ ./src/

# Copy built dashboard from previous stage
COPY --from=dashboard-builder /build/src/dashboard/dist ./src/dashboard/dist


# ── Stage 3: Runtime Container ──────────────────────────────────
FROM node:20-slim

# Install PostgreSQL 15, MCP server dependencies (Python + uv), and runtime tools
RUN apt-get update && apt-get install -y \
    postgresql-15 \
    postgresql-contrib-15 \
    wget \
    curl \
    ca-certificates \
    supervisor \
    python3 \
    python3-pip \
    pipx \
    && rm -rf /var/lib/apt/lists/*

# Install uv/uvx for Python-based MCP servers (MiniMax TTS/video/image)
RUN pipx install uv && ln -s /root/.local/bin/uv /usr/local/bin/uv && ln -s /root/.local/bin/uvx /usr/local/bin/uvx

# Download PostgREST
RUN wget https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz \
    && tar -xf postgrest-v12.2.3-linux-static-x64.tar.xz -C /usr/local/bin/ \
    && rm postgrest-v12.2.3-linux-static-x64.tar.xz \
    && chmod +x /usr/local/bin/postgrest

# Download picobot v0.1.3-preview
RUN wget https://github.com/louisho5/picobot/releases/download/v0.1.3-preview/picobot_linux_amd64 -O /usr/local/bin/picobot \
    && chmod +x /usr/local/bin/picobot

# Create postgres user/group if they don't exist (for running PG)
RUN groupadd -r postgres 2>/dev/null || true \
    && useradd -r -g postgres postgres 2>/dev/null || true

# Create app directory structure
WORKDIR /app

# Copy Commander application
COPY --from=commander-builder /build/package*.json ./
COPY --from=commander-builder /build/tsconfig.json ./
COPY --from=commander-builder /build/node_modules ./node_modules/
COPY --from=commander-builder /build/src ./src/

# Copy database init scripts
COPY init-db/ ./init-db/

# Copy soul templates and swarm templates
COPY souls/ ./souls/
COPY swarms/ ./swarms/

# Copy MCP server config
COPY mcp-servers.json ./mcp-servers.json

# Create data directories
RUN mkdir -p /data/postgres /data/bots /data/pids \
    && chown -R postgres:postgres /data/postgres

# Create Supervisor config
RUN mkdir -p /etc/supervisor/conf.d

# Create entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose ports
# 4000 = Commander (dashboard + API)
# (Postgres and PostgREST are internal only)
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:4000/api/fleet/process/status || exit 1

# Set environment defaults
ENV NODE_ENV=production \
    POSTGRES_DB=picoarmy \
    POSTGRES_USER=commander \
    PGDATA=/data/postgres \
    POSTGREST_URL=http://localhost:3000

# Use entrypoint to orchestrate startup
ENTRYPOINT ["/docker-entrypoint.sh"]
