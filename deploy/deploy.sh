#!/usr/bin/env bash
# Updates the running app to the build named by WORDWRIGHT_TAG in .env. Run on the server, from this folder:
#   ./deploy.sh
# It takes a backup first (migrations only go forward, so the backup is how you go back; see docs/deploy.md), pulls the
# images, restarts, and waits until the API says it is ready.
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] || { echo "No .env here: copy production.env.example to .env and fill it in." >&2; exit 1; }

if docker compose ps --status running --services 2>/dev/null | grep -qx api; then
  echo "Backing up the database before the update..."
  docker compose exec -T api node /app/scripts/backup-db.mjs /data/backups
else
  echo "The app is not running (a first deploy?), so there is nothing to back up."
fi

docker compose pull
docker compose up -d --remove-orphans

echo "Waiting for the API to be ready..."
for _ in $(seq 1 30); do
  state=$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q api)" 2>/dev/null || true)
  if [ "$state" = "healthy" ]; then
    echo "Ready. Running: $(grep '^WORDWRIGHT_TAG=' .env)"
    exit 0
  fi
  sleep 2
done

echo "The API did not become ready in a minute. Look at: docker compose logs --tail 100 api" >&2
echo "To go back: see 'Rolling back' in docs/deploy.md." >&2
exit 1
