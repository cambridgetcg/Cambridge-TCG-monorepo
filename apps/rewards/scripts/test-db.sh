#!/usr/bin/env bash
# Two local Postgres servers: a throwaway one for the Postgres test suites,
# and staging's own (Ruling 75).
#
# The test database, on 127.0.0.1:55432:
#
#   eval "$(scripts/test-db.sh start)" && pnpm test:postgres
#   scripts/test-db.sh stop
#
# start: initialises ${TMPDIR:-/tmp}/rewards-pg, starts the server, provisions
# it with test/postgres/helpers/setup-database.sql as the superuser and applies
# prisma/migrations as rewards_app (pnpm migrate:deploy). If the server is
# already running (from a start that finished) it does nothing more. Either
# way stdout carries only the export line (REWARDS_TEST_DATABASE_URL, with
# connection_limit=1), so eval works; everything else goes to stderr. A
# server started before a migration was added or changed needs stop, then
# start.
#
# stop: stops the server and deletes the data directory.
#
# The staging database, on 127.0.0.1:55433, for the staging run (A25):
#
#   eval "$(scripts/test-db.sh staging start)"
#   scripts/test-db.sh staging url     # the same export lines, starting nothing
#   scripts/test-db.sh staging stop
#
# A second server with its own data directory, ${TMPDIR:-/tmp}/rewards-pg-staging,
# and its own port, provisioned the same way, so it runs beside the test
# database. Every Postgres suite truncates every table of its database, so
# no suite ever touches this one: the suites' guard
# (test/postgres/helpers/test-database-url.ts) refuses its port.
#
# staging start: as start, but stdout carries the app's own variables,
# REWARDS_DATABASE_URL (with connection_limit=3, as production's pool) and
# REWARDS_DIRECT_URL (the same database, for migrations), never
# REWARDS_TEST_DATABASE_URL. It runs migrate:deploy every time, a running
# server included, so a migration added since applies without losing the
# staging data. A changed migration can't be applied; that needs staging stop.
#
# staging stop: stops the server and deletes its data directory, with the
# staging store's merchant, session and orders in it.
#
# Uses initdb, pg_ctl, pg_isready and psql from PATH.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="${TMPDIR:-/tmp}"
TMP_ROOT="${TMP_ROOT%/}"
HOST=127.0.0.1
# The app role setup-database.sql provisions; its password is its name
ROLE=rewards_app
# test/postgres/helpers/test-database-url.ts refuses this port
STAGING_PORT=55433

MODE=test
if [ "${1:-}" = staging ]; then
  MODE=staging
  shift
fi

if [ "$MODE" = staging ]; then
  DATA_DIR="$TMP_ROOT/rewards-pg-staging"
  PORT=$STAGING_PORT
  DIRECT_URL="postgresql://$ROLE:$ROLE@$HOST:$PORT/postgres?schema=rewards"
  APP_URL="$DIRECT_URL&connection_limit=3"
  MIGRATE_URL="$DIRECT_URL"
else
  DATA_DIR="$TMP_ROOT/rewards-pg"
  PORT=55432
  TEST_URL="postgresql://$ROLE:$ROLE@$HOST:$PORT/postgres?schema=rewards&connection_limit=1"
  MIGRATE_URL="$TEST_URL"
fi
READY_MARK="$DATA_DIR/rewards-ready"

log() {
  if [ "$MODE" = staging ]; then echo "[test-db staging] $*" >&2; else echo "[test-db] $*" >&2; fi
}

exports() {
  if [ "$MODE" = staging ]; then
    echo "export REWARDS_DATABASE_URL='$APP_URL'"
    echo "export REWARDS_DIRECT_URL='$DIRECT_URL'"
  else
    echo "export REWARDS_TEST_DATABASE_URL='$TEST_URL'"
  fi
}

running() {
  [ -f "$DATA_DIR/postmaster.pid" ] && pg_ctl -D "$DATA_DIR" status >/dev/null 2>&1
}

migrate() {
  log "applying migrations as rewards_app"
  (cd "$APP_DIR" && REWARDS_DIRECT_URL="$MIGRATE_URL" PRISMA_HIDE_UPDATE_MESSAGE=1 pnpm --silent migrate:deploy) >&2
}

start() {
  if running; then
    if [ -f "$READY_MARK" ]; then
      # Staging keeps its data: only the migrations added since are applied
      if [ "$MODE" = staging ]; then migrate; fi
      exports
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

  migrate
  touch "$READY_MARK"

  exports
}

stop() {
  if running; then
    log "stopping Postgres"
    pg_ctl -D "$DATA_DIR" -m fast -w stop >&2
  fi
  rm -rf "$DATA_DIR"
  log "removed $DATA_DIR"
}

case "$MODE:${1:-}" in
  *:start) start ;;
  *:stop) stop ;;
  staging:url) exports ;;
  *)
    echo "usage: scripts/test-db.sh start|stop" >&2
    echo "       scripts/test-db.sh staging start|stop|url" >&2
    exit 2
    ;;
esac
