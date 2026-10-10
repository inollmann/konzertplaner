#!/usr/bin/env bash
set -e

CONFIG_PATH=/data/options.json

LOG_LEVEL="$(jq --raw-output '.log_level // "info"' "$CONFIG_PATH")"
DATABASE_URL="$(jq --raw-output '.database_url // ""' "$CONFIG_PATH")"

# Enable the Werkzeug debugger/reloader only for verbose log levels.
if [ "$LOG_LEVEL" = "debug" ] || [ "$LOG_LEVEL" = "trace" ]; then
    export KP_DEBUG=1
else
    export KP_DEBUG=0
fi

export PORT=5000

# Default to the built-in SQLite database inside the add-on's persistent
# /data volume. Set the `database_url` option to use PostgreSQL instead.
if [ -z "$DATABASE_URL" ]; then
    export DATABASE_URL="sqlite:////data/konzertplaner.db"
fi

echo "[konzertplaner] log_level=$LOG_LEVEL"
echo "[konzertplaner] database=$DATABASE_URL"

exec python3 /app/main.py
