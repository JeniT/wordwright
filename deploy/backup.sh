#!/usr/bin/env bash
# One backup of the database: a safe copy inside the container (scripts/backup-db.mjs), then a copy of that onto the
# server's own disk, in an ordinary folder you can fetch with rsync or scp. The nightly timer runs this
# (server-setup.sh timer). It keeps BACKUP_KEEP_DAYS days (default 14): short on purpose, so a deleted account's data
# does not linger in old copies. With ./offsite.env present it also uploads an encrypted copy off the machine. With
# ./monitor.env present it ends by pinging HEARTBEAT_URL, so a monitor can alert when a night passes without one
# (docs/runbook.md): a failed backup, a nearly full disk, a stopped timer or a lost server all look the same there.
set -euo pipefail
cd "$(dirname "$0")"

out="${BACKUP_DIR:-$HOME/backups}"
keep_days="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$out"
chmod 700 "$out"

# The disk is small, and a full one stops the database taking writes. Failing here, well before that, is the warning.
max_used="${BACKUP_MAX_DISK_PERCENT:-90}"
used=$(df -P "$out" | awk 'NR == 2 { sub("%", "", $5); print $5 }')
if [ "$used" -ge "$max_used" ]; then
  echo "Not backing up: the disk is $used% full (the limit is $max_used%). Free some space (docs/runbook.md)." >&2
  exit 1
fi

file=$(docker compose exec -T api node /app/scripts/backup-db.mjs /data/backups)
docker compose cp "api:$file" "$out/"
find "$out" -name 'wordwright-*.sqlite' -mtime +"$keep_days" -delete
echo "Backed up to $out/$(basename "$file")"

# The list of account deletions (ids only) lives beside the database and is not replaced by a rollback. A copy goes with the
# backups so it is also in the off-site copy: after losing the server it says whose deletions to repeat (docs/deploy.md).
docker compose cp api:/data/deletions.jsonl "$out/deletions.jsonl" 2>/dev/null || true

# Then an encrypted copy in a bucket at another provider, if that has been set up (deploy/offsite-wizard.sh). If it fails
# the local backup above is still there, but this exits non-zero so the nightly run shows as failed.
if [ -f offsite.env ]; then
  ./offsite.sh upload
fi

# Last, so it is sent only when everything above worked.
if [ -f monitor.env ]; then
  # shellcheck disable=SC1091
  . ./monitor.env
  curl -fsS -m 10 --retry 3 -o /dev/null "$HEARTBEAT_URL"
fi
