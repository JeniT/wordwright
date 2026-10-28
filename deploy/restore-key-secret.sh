#!/usr/bin/env bash
# Puts the KEY_ENCRYPTION_SECRET saved in your password manager onto the server, in place of the one there, and restarts
# the app with it. Run it on your own computer, from this repository, when you have rebuilt a server to restore its
# backups (docs/deploy.md, "Restoring from the off-site copy"): the secret the wizard made cannot read the AI keys in the
# backup. You paste it at a hidden prompt here, where pasting works; it goes over ssh straight into ~/wordwright/.env,
# and is never shown, written to a file on this computer, or kept in your shell's history (#423).
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env.server-setup}" # the setup wizard's answers: the server's address and your key
answer() { [ -f "$ENV_FILE" ] && sed -n "s/^$1='\(.*\)'\$/\1/p" "$ENV_FILE" | tail -n1; }
server=$(answer SERVER_IP || true)
key=$(answer SSH_KEY || true)
[ -n "$server" ] && [ -n "$key" ] || { echo "No server address in $ENV_FILE: run deploy/setup-wizard.sh first." >&2; exit 1; }

echo "Server: $server (from $ENV_FILE)"
while :; do
  read -rsp "Paste the saved KEY_ENCRYPTION_SECRET (hidden): " secret
  echo
  secret=$(printf '%s' "$secret" | tr -d '[:space:]')
  ((${#secret} >= 32)) && break
  echo "That is ${#secret} characters, and the secret is at least 32 (the wizard makes 64). Paste it again." >&2
done

# The remote side reads the secret from stdin, so it is never in a command line (which other accounts could see).
printf '%s\n' "$secret" | ssh -i "$key" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes "wordwright@$server" '
  set -e
  cd ~/wordwright
  [ -f .env ] || { echo "No .env in ~/wordwright on the server: run deploy/setup-wizard.sh first." >&2; exit 1; }
  IFS= read -r secret
  umask 077
  grep -v "^KEY_ENCRYPTION_SECRET=" .env > .env.tmp || true
  printf "KEY_ENCRYPTION_SECRET=%s\n" "$secret" >> .env.tmp
  mv .env.tmp .env
  chmod 600 .env
  docker compose up -d --force-recreate api
'
unset secret
echo "Done: the app has restarted with the saved secret. Check that Your AI shows your key and a brainstorm message gets a reply."
