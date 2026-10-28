#!/usr/bin/env bash
# Off-site copies of the database backups: encrypted here, then stored in a bucket at another provider (Scaleway Object
# Storage), so losing the server, or the whole UpCloud account, does not lose them. Run on the server, from this folder:
#
#   ./offsite.sh upload          copy ~/backups to the bucket (backup.sh does this every night)
#   ./offsite.sh list            the backups in the bucket
#   ./offsite.sh fetch <name> [folder]   bring one back (default folder ~/restored), decrypted, ready for ./rollback.sh
#   ./offsite.sh verify          fetch the newest, check it opens and is intact, then delete the copy
#
# The settings (the bucket, its key, the encryption password) are in ./offsite.env, written by deploy/offsite-wizard.sh.
# Files are encrypted with rclone's "crypt" before they leave the server, names included, so the bucket holds nothing
# readable. Without the password and salt (keep them in your password manager) the backups cannot be opened by anyone.
# rclone runs from its own pinned image; nothing is installed on the server.
set -euo pipefail
cd "$(dirname "$0")"

RCLONE_IMAGE="rclone/rclone:1.75.2"
backups="${BACKUP_DIR:-$HOME/backups}"

[ -f offsite.env ] || { echo "No offsite.env here: run deploy/offsite-wizard.sh from your computer first." >&2; exit 1; }

# The encrypted remote is called OFFSITE (see offsite.env).

case "${1:-}" in
  upload)
    mkdir -p "$backups"
    # "copy" never deletes in the bucket: the bucket's own expiry rule removes old copies. Same name and size are skipped.
    docker run --rm -e RCLONE_LOG_LEVEL=ERROR --env-file offsite.env -v "$backups":/backups:ro "$RCLONE_IMAGE" \
      copy /backups OFFSITE: --include 'wordwright-*.sqlite' --include 'deletions.jsonl' --transfers 2 --retries 3
    echo "Off-site copy is up to date."
    ;;
  list)
    docker run --rm -e RCLONE_LOG_LEVEL=ERROR --env-file offsite.env "$RCLONE_IMAGE" lsl OFFSITE:
    ;;
  fetch)
    name="${2:?Usage: ./offsite.sh fetch <name> [folder]}"
    dest="${3:-$HOME/restored}"
    mkdir -p "$dest"
    rm -f "$dest/$name" # a copy from an earlier fetch must not pass for this one
    docker run --rm -e RCLONE_LOG_LEVEL=ERROR --env-file offsite.env -v "$dest":/restore "$RCLONE_IMAGE" copy "OFFSITE:$name" /restore
    # rclone's copy succeeds when nothing by that name is there, so look (#423).
    [ -f "$dest/$name" ] || { echo "The bucket has nothing called $name. ./offsite.sh list shows what is there." >&2; exit 1; }
    echo "Fetched to $dest/$name"
    ;;
  verify)
    newest=$(docker run --rm -e RCLONE_LOG_LEVEL=ERROR --env-file offsite.env "$RCLONE_IMAGE" lsf OFFSITE: --include 'wordwright-*.sqlite' | sort | tail -n1)
    [ -n "$newest" ] || { echo "The bucket holds no backups yet." >&2; exit 1; }
    echo "Checking $newest ..."
    # Stream it from the bucket into the app's image, which has the database library, and check it there.
    docker run --rm -e RCLONE_LOG_LEVEL=ERROR --env-file offsite.env "$RCLONE_IMAGE" cat "OFFSITE:$newest" \
      | docker compose run --rm --no-deps -T api sh -c '
          cat > /tmp/verify.sqlite
          node -e "
            const { DatabaseSync } = require(\"node:sqlite\")
            const db = new DatabaseSync(\"/tmp/verify.sqlite\", { readOnly: true })
            const check = db.prepare(\"PRAGMA integrity_check\").get().integrity_check
            const users = db.prepare(\"SELECT count(*) AS n FROM users\").get().n
            console.log(\"integrity: \" + check + \", users: \" + users)
            process.exit(check === \"ok\" ? 0 : 1)
          "
          rm -f /tmp/verify.sqlite
        '
    ;;
  *)
    echo "Usage: ./offsite.sh upload|list|fetch <name> [folder]|verify" >&2
    exit 1
    ;;
esac
