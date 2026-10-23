#!/usr/bin/env bash
# Goes back to an older build AND to the database as it was before the update. Run on the server, from this folder:
#   ./rollback.sh <older commit hash> [backup file]
# Migrations only go forward and a build refuses a database made by a newer one, so an older build needs an older
# database. The backup is the newest in ~/backups (the one ./deploy.sh took before the update) unless you name another.
# Everything written since that backup is lost, so the sooner the better. The database it replaces is not deleted: it is
# moved to /data/replaced-<time> in the volume.
set -euo pipefail
cd "$(dirname "$0")"

tag="${1:-}"
[ -n "$tag" ] || { echo "Usage: ./rollback.sh <older commit hash> [backup file]" >&2; exit 1; }
[ -f .env ] || { echo "No .env here." >&2; exit 1; }

backups="${BACKUP_DIR:-$HOME/backups}"
file="${2:-$(ls -1t "$backups"/wordwright-*.sqlite 2>/dev/null | head -n1 || true)}"
[ -n "$file" ] && [ -f "$file" ] || { echo "No backup found in $backups; name one as the second argument." >&2; exit 1; }

echo "Going back to build:  $tag"
echo "Database from:        $file  ($(date -r "$file" '+%d %b %Y %H:%M' 2>/dev/null || echo "date unknown"))"
echo "Anything written after that time will be lost."
read -r -p "Type 'rollback' to go ahead: " answer
[ "$answer" = "rollback" ] || { echo "Cancelled; nothing changed."; exit 1; }

docker compose stop web api

# Stream the backup in (so the file is created by the app's own user, whoever owns the copy on the server), move the
# current database aside rather than deleting it, and put the backup in its place.
docker compose run --rm --no-deps -T api sh -c '
  set -e
  cat > /data/restore.tmp
  stamp=$(date +%Y%m%d-%H%M%S)
  mkdir -p "/data/replaced-$stamp"
  for f in /data/wordwright.sqlite /data/wordwright.sqlite-wal /data/wordwright.sqlite-shm; do
    if [ -e "$f" ]; then mv "$f" "/data/replaced-$stamp/"; fi
  done
  mv /data/restore.tmp /data/wordwright.sqlite
  echo "The database it replaced is in /data/replaced-$stamp"
' < "$file"

grep -v '^WORDWRIGHT_TAG=' .env > .env.tmp || true
printf 'WORDWRIGHT_TAG=%s\n' "$tag" >> .env.tmp
mv .env.tmp .env
chmod 600 .env

./deploy.sh
