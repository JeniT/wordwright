#!/usr/bin/env bash
# One backup of the database: a safe copy inside the container (scripts/backup-db.mjs), then a copy of that onto the
# server's own disk, in an ordinary folder you can fetch with rsync or scp. The nightly timer runs this
# (server-setup.sh timer). It keeps BACKUP_KEEP_DAYS days (default 14): short on purpose, so a deleted account's data
# does not linger in old copies.
set -euo pipefail
cd "$(dirname "$0")"

out="${BACKUP_DIR:-$HOME/backups}"
keep_days="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$out"
chmod 700 "$out"

file=$(docker compose exec -T api node /app/scripts/backup-db.mjs /data/backups)
docker compose cp "api:$file" "$out/"
find "$out" -name 'wordwright-*.sqlite' -mtime +"$keep_days" -delete
echo "Backed up to $out/$(basename "$file")"
