#!/bin/bash
set -e

echo "=== PicoArmy Container Starting ==="

# ── Step 1: Initialize PostgreSQL ────────────────────────────────

if [ ! -d "${PGDATA}/base" ]; then
    echo "[1/6] Initializing PostgreSQL database..."
    su postgres -c "initdb -D ${PGDATA}"

    # Configure PostgreSQL for local connections
    echo "host all all 127.0.0.1/32 trust" >> ${PGDATA}/pg_hba.conf
    echo "listen_addresses = 'localhost'" >> ${PGDATA}/postgresql.conf
else
    echo "[1/6] PostgreSQL database already initialized"
fi

# ── Step 2: Start PostgreSQL ─────────────────────────────────────

echo "[2/6] Starting PostgreSQL..."
su postgres -c "pg_ctl -D ${PGDATA} -l ${PGDATA}/logfile start"

# Wait for PostgreSQL to be ready
echo "[2/6] Waiting for PostgreSQL to accept connections..."
until su postgres -c "pg_isready -h 127.0.0.1 -p 5432" > /dev/null 2>&1; do
    sleep 1
done
echo "[2/6] PostgreSQL is ready"

# ── Step 3: Initialize Database Schema ───────────────────────────

# Check if database exists
DB_EXISTS=$(su postgres -c "psql -lqt | cut -d \| -f 1 | grep -w ${POSTGRES_DB} || true")

if [ -z "$DB_EXISTS" ]; then
    echo "[3/6] Creating database ${POSTGRES_DB}..."
    su postgres -c "psql -c \"CREATE DATABASE ${POSTGRES_DB};\""
    su postgres -c "psql -c \"CREATE USER ${POSTGRES_USER} WITH PASSWORD '${POSTGRES_PASSWORD}';\""
    su postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB} TO ${POSTGRES_USER};\""

    echo "[3/6] Running database initialization scripts..."
    for script in /app/init-db/*.sql; do
        echo "  - $(basename $script)"
        su postgres -c "psql -d ${POSTGRES_DB} -f $script"
    done
else
    echo "[3/6] Database ${POSTGRES_DB} already exists"
fi

# ── Step 4: Start PostgREST ──────────────────────────────────────

echo "[4/6] Starting PostgREST..."

# Create PostgREST config
cat > /tmp/postgrest.conf <<EOF
db-uri = "postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}"
db-schemas = "api"
db-anon-role = "web_anon"
server-port = 3000
jwt-secret = "${JWT_SECRET}"
EOF

# Start PostgREST in background
postgrest /tmp/postgrest.conf > /data/postgrest.log 2>&1 &
POSTGREST_PID=$!
echo "[4/6] PostgREST started (PID: $POSTGREST_PID)"

# Wait for PostgREST to be ready
echo "[4/6] Waiting for PostgREST to accept connections..."
until curl -s http://localhost:3000/ > /dev/null 2>&1; do
    sleep 1
done
echo "[4/6] PostgREST is ready"

# ── Step 5: Clean up orphaned bot PIDs ───────────────────────────

echo "[5/6] Cleaning orphaned bot processes from previous runs..."
if [ -d "/data/pids" ]; then
    for pidfile in /data/pids/*.pid; do
        if [ -f "$pidfile" ]; then
            PID=$(cat "$pidfile")
            if ps -p $PID > /dev/null 2>&1; then
                echo "  - Killing orphaned process $PID"
                kill -9 $PID || true
            fi
            rm "$pidfile"
        fi
    done
fi

# ── Step 6: Start Commander ──────────────────────────────────────

echo "[6/6] Starting Commander..."
cd /app

# Export environment for Commander
export POSTGREST_URL=http://localhost:3000
export NODE_ENV=production

# Start Commander in foreground (this becomes PID 1's main process)
# Use npx to resolve tsx from node_modules (tsx is included via npm ci)
exec npx tsx src/commander.ts
