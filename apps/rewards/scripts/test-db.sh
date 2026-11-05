#!/usr/bin/env bash
# A throwaway Postgres for the Postgres test suites, on 127.0.0.1:55432.
#
#   eval "$(scripts/test-db.sh start)" && pnpm test:postgres
#   scripts/test-db.sh stop
#
# start: initialises ${TMPDIR:-/tmp}/rewards-pg, starts the server, provisions
# it with test/postgres/helpers/setup-database.sql as the superuser and applies
# prisma/migrations as rewards_app (pnpm migrate:deploy). If the server is
# already running (from a start that finished) it does nothing more. Either
# way stdout carries only the export line, so eval works; everything else
# goes to stderr. A server started before a migration was added or changed
# needs stop, then start.
#
# stop: stops the server and deletes the data directory.
#
# Uses initdb, pg_ctl, pg_isready and psql from PATH.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${TMPDIR:-/tmp}"
DATA_DIR="${DATA_DIR%/}/rewards-pg"
HOST=127.0.0.1
PORT=55432
READY_MARK="$DATA_DIR/rewards-ready"
TEST_URL="postgresql://rewards_app:rewards_app@$HOST:$PORT/postgres?schema=rewards&connection_limit=1"

log() { echo "[test-db] $*" >&2; }

running() {
  [ -f "$DATA_DIR/postmaster.pid" ] && pg_ctl -D "$DATA_DIR" status >/dev/null 2>&1
}

start() {
  if running; then
    if [ -f "$READY_MARK" ]; then
      echo "export REWARDS_TEST_DATABASE_URL='$TEST_URL'"
      return
    fi
    log "an earlier start did not finish; starting again"
    pg_ctl -D "$DATA_DIR" -m fast -w stop >&2
  fi
  if pg_isready -q -h "$HOST" -p "$PORT"; then
    log "another server already answers on $HOST:$PORT; stop it first"
    exit 1
  fi

  local fresh=0
  if [ ! -f "$READY_MARK" ]; then
    # Missing or half-made (an earlier start failed): begin again.
    rm -rf "$DATA_DIR"
    local pwfile
    pwfile="$(mktemp)"
    echo postgres >"$pwfile"
    log "initdb $DATA_DIR"
    initdb -D "$DATA_DIR" -U postgres --pwfile="$pwfile" \
      --auth-local=trust --auth-host=scram-sha-256 \
      --encoding=UTF8 --no-locale --no-instructions >&2
    rm -f "$pwfile"
    fresh=1
  fi
  # Written back only once the migrations are in.
  rm -f "$READY_MARK"

  log "starting Postgres on $HOST:$PORT"
  pg_ctl -D "$DATA_DIR" -l "$DATA_DIR/server.log" -w \
    -o "-p $PORT -c listen_addresses=$HOST -c unix_socket_directories=''" start >&2

  if [ "$fresh" = 1 ]; then
    log "provisioning role rewards_app and schema rewards"
    PGPASSWORD=postgres psql -q -X -v ON_ERROR_STOP=1 -h "$HOST" -p "$PORT" -U postgres -d postgres \
      -f "$APP_DIR/test/postgres/helpers/setup-database.sql" >&2
  fi

  log "applying migrations as rewards_app"
  (cd "$APP_DIR" && REWARDS_DIRECT_URL="$TEST_URL" PRISMA_HIDE_UPDATE_MESSAGE=1 pnpm --silent migrate:deploy) >&2
  touch "$READY_MARK"

  echo "export REWARDS_TEST_DATABASE_URL='$TEST_URL'"
}

stop() {
  if running; then
    log "stopping Postgres"
    pg_ctl -D "$DATA_DIR" -m fast -w stop >&2
  fi
  rm -rf "$DATA_DIR"
  log "removed $DATA_DIR"
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  *)
    echo "usage: scripts/test-db.sh start|stop" >&2
    exit 2
    ;;
esac
