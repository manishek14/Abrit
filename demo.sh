#!/usr/bin/env bash
# ============================================================================
# AbrIT — one-command demo deployment
#
#   ./demo.sh
#
# Boots, in order:
#   1. PostgreSQL — reused if DATABASE_URL is already reachable, otherwise
#      `docker compose up -d db` (postgres:16-alpine from docker-compose.yml)
#   2. Backend    — production build (node dist/main.js) on :3000;
#      pending migrations and the Persian demo seed run automatically on boot
#   3. Admin panel — static frontend build served by `vite preview` on :5173
#
# Demo login: admin@abrit.local / Admin1234!   (development default — see .env)
# Requirements: Node 20+, npm, and (only if no local PostgreSQL) Docker.
# ============================================================================
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

log()  { printf '\033[0;32m[demo]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[demo]\033[0m %s\n' "$*" >&2; }

# --- 1) environment ---------------------------------------------------------
if [ ! -f .env ]; then
  cp .env.example .env
  node -e '
    const fs = require("fs"), crypto = require("crypto");
    let s = fs.readFileSync(".env", "utf8");
    s = s.replace(/^JWT_SECRET=.*/m, "JWT_SECRET=" + crypto.randomBytes(32).toString("hex"));
    fs.writeFileSync(".env", s);
  '
  log "created .env from the template (random JWT_SECRET generated)"
fi

DB_URL="$(sed -n 's/^DATABASE_URL=//p' .env | tail -1 | tr -d '\r')"
API_PORT="$(sed -n 's/^PORT=//p' .env | tail -1 | tr -d '\r')"
API_PORT="${API_PORT:-3000}"
PANEL_PORT="${PANEL_PORT:-5173}"

# The .env file is the single source of truth for the demo: ambient env vars
# (which @nestjs/config would prefer) must not override it.
export DATABASE_URL="$DB_URL"
export PORT="$API_PORT"

# --- 2) database ------------------------------------------------------------
# TCP probe only (no driver needed): reuse an already-running PostgreSQL.
if DB_URL="${DB_URL:-postgres://abrit:abrit@127.0.0.1:5432/abrit}" node -e '
  const net = require("net");
  const u = new URL(process.env.DB_URL);
  const s = net.connect({ host: u.hostname, port: Number(u.port || 5432) }, () => { s.end(); process.exit(0); });
  s.on("error", () => process.exit(1));
  setTimeout(() => process.exit(1), 2000);
' 2>/dev/null; then
  log "PostgreSQL reachable — reusing the existing server"
else
  log "PostgreSQL not reachable at DATABASE_URL — starting docker compose db"
  if ! command -v docker >/dev/null 2>&1; then
    warn "no docker and no PostgreSQL at: ${DB_URL:-<unset>}"
    warn "start PostgreSQL yourself (docker compose up -d db) and re-run ./demo.sh"
    exit 1
  fi
  docker compose up -d db --wait
fi

# --- 3) builds (idempotent: skipped when the artifacts exist) ---------------
[ -d backend/node_modules ]  || (cd backend  && npm ci --no-audit --no-fund)
[ -f backend/dist/main.js ]   || (cd backend  && npm run build)
[ -d frontend/node_modules ]  || (cd frontend && npm ci --no-audit --no-fund)
[ -f frontend/dist/index.html ] || (cd frontend && npm run build)

# --- 4) run ------------------------------------------------------------------
# Panel in the background, backend in the foreground (Ctrl-C stops both).
(cd frontend && exec npx vite preview --port "$PANEL_PORT" --strictPort --host 0.0.0.0) &
PANEL_PID=$!
trap 'kill "$PANEL_PID" 2>/dev/null || true' EXIT

log "admin panel   → http://localhost:${PANEL_PORT}"
log "API / docs    → http://localhost:${API_PORT}/api   (swagger: /api/docs)"
log "demo login    → admin@abrit.local / Admin1234!     (override in .env)"
log "migrations + Persian demo seed run automatically on boot"

cd backend
exec node dist/main.js
