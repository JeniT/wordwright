#!/usr/bin/env bash
# Ships a new build to the production server in one go. Run it on your own computer, from this repository:
#   deploy/ship.sh                       build the newest main, then deploy it
#   deploy/ship.sh --tag <commit hash>   deploy images that are already built (skips the build)
#   deploy/ship.sh --ref <branch>        build another branch instead of main
#   deploy/ship.sh -y                    don't ask before deploying
#   deploy/ship.sh wordwright            any ssh destination (a Host in ~/.ssh/config, or wordwright@<address>);
#                                        by default the server in the setup wizard's answers
# What it does, in order: finds the commit; says whether CI passed on it; runs the Images workflow for it (or
# reuses an earlier run); shows which build is live and which is next, and waits for you to type "deploy"; copies the
# deploy files from that commit to the server; sets WORDWRIGHT_TAG in ~/wordwright/.env and runs ./deploy.sh there
# (which backs up first, pulls, restarts and waits until the API is ready); and checks /health from here.
# It needs ssh, git and a signed-in gh. See docs/deploy.md, "Shipping a build". To go back: ./rollback.sh on the server.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DEPLOY_DIR/.."

REMOTE_DIR="wordwright" # under the app user's home
SITE_URL="${SITE_URL:-https://app.wordwright.io}"
# What the setup wizard copies to the server; the Caddyfile is inside the web image, so it is not here.
SYNC_FILES=(compose.yaml deploy.sh backup.sh rollback.sh production.env.example server-setup.sh)

usage() { sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }
die() { echo "$*" >&2; exit 1; }

ref=main
tag=""
yes=false
dest=""
while [ $# -gt 0 ]; do
  case "$1" in
    --tag) [ $# -ge 2 ] || die "--tag needs a commit hash."; tag="$2"; shift 2 ;;
    --ref) [ $# -ge 2 ] || die "--ref needs a branch name."; ref="$2"; shift 2 ;;
    -y | --yes) yes=true; shift ;;
    -h | --help) usage; exit 0 ;;
    -*) usage >&2; die "Unknown option: $1" ;;
    *) [ -z "$dest" ] || die "Only one server can be named."; dest="$1"; shift ;;
  esac
done
if [ -n "$tag" ] && ! [[ "$tag" =~ ^[0-9a-f]{40}$ ]]; then
  die "--tag wants the full 40-character commit hash (the Images runs on GitHub show it), not '$tag'."
fi

for tool in ssh git gh; do command -v "$tool" >/dev/null || die "$tool is needed and was not found."; done

confirm() { # confirm "message": true when you typed "deploy" (or -y)
  local answer
  [ -z "$1" ] || echo "$1"
  $yes && return 0
  read -r -p "Type 'deploy' to go ahead: " answer
  [ "$answer" = "deploy" ]
}

# ── The server ────────────────────────────────────────────────────────────
CTL_DIR=$(mktemp -d /tmp/wwXXXXXX)
OPTS=(-o ControlMaster=auto -o ControlPersist=2m -o "ControlPath=$CTL_DIR/%C") # one login, so a passphrase is asked once
if [ -n "$dest" ]; then
  DEST="$dest"
  echo "Server: $dest"
else
  ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env.server-setup}" # the setup wizard's answers: the server's address and your key
  answer() { [ -f "$ENV_FILE" ] && sed -n "s/^$1='\(.*\)'\$/\1/p" "$ENV_FILE" | tail -n1; return 0; }
  server=$(answer SERVER_IP)
  key=$(answer SSH_KEY)
  if [ -z "$server" ] || [ -z "$key" ]; then
    die "No server address in $ENV_FILE. Name the server instead: deploy/ship.sh wordwright@<address> (or a Host from your ~/.ssh/config)."
  fi
  OPTS+=(-i "$key" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes)
  DEST="wordwright@$server"
  echo "Server: $server (from $ENV_FILE)"
fi
remote() { ssh "${OPTS[@]}" "$DEST" "$@"; }
cleanup() {
  ssh "${OPTS[@]}" -O exit "$DEST" >/dev/null 2>&1 || true
  rm -rf "$CTL_DIR"
}
trap cleanup EXIT

remote "[ -f $REMOTE_DIR/.env ]" || die "Can't reach the server, or there is no ~/$REMOTE_DIR/.env on it: run deploy/setup-wizard.sh first."
live=$(remote "sed -n 's/^WORDWRIGHT_TAG=//p' $REMOTE_DIR/.env | tail -n1")

# ── The build ─────────────────────────────────────────────────────────────
if [ -n "$tag" ]; then
  echo "Deploying the build you named, $tag. (Its images must already be on ghcr.io: see the Images runs on GitHub.)"
else
  gh auth status >/dev/null 2>&1 || die "gh is not signed in: run 'gh auth login'."
  git fetch --quiet origin "$ref" || die "Couldn't fetch '$ref' from origin: is it pushed?"
  sha=$(git rev-parse "origin/$ref")
  if [ "$(git rev-parse --verify --quiet "$ref" || true)" != "" ] && [ "$(git rev-parse "$ref")" != "$sha" ]; then
    echo "Note: your local $ref is not the same as origin/$ref. Only what is pushed is shipped (origin/$ref, $sha)."
  fi
  echo "Commit: $(git log -1 --format='%h %s' "$sha")"

  ci=$(gh run list --workflow ci.yml --commit "$sha" --limit 1 --json status,conclusion --jq '.[0] | "\(.status) \(.conclusion)"' 2>/dev/null || true)
  case "$ci" in
    "completed success") echo "CI: passed on this commit." ;;
    "") confirm "CI: no run found for this commit." || die "Cancelled; nothing changed." ;;
    *) confirm "CI: not passed on this commit ($ci)." || die "Cancelled; nothing changed." ;;
  esac

  built=$(gh run list --workflow image.yml --commit "$sha" --status success --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)
  if [ -n "$built" ]; then
    echo "Images: already built for this commit (run $built); not building again."
    tag="$sha"
  else
    echo "Images: building (this takes a few minutes)..."
    before=$(gh run list --workflow image.yml --limit 1 --json databaseId --jq '.[0].databaseId // 0')
    gh workflow run image.yml --ref "$ref"
    run=0
    for _ in $(seq 1 30); do
      run=$(gh run list --workflow image.yml --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId // 0')
      if [ "$run" != "0" ] && [ "$run" != "$before" ]; then break; fi
      run=0
      sleep 2
    done
    [ "$run" != "0" ] || die "The Images run didn't start. Look under Actions → Images on GitHub."
    tag=$(gh run view "$run" --json headSha --jq .headSha)
    if [ "$tag" != "$sha" ]; then
      confirm "Note: $ref moved while you waited; the run built $tag, not $sha." || die "Cancelled; the images exist, and nothing on the server changed."
    fi
    gh run watch "$run" --exit-status >/dev/null || die "The Images run failed: gh run view $run --log-failed. Nothing on the server changed."
    echo "Images: built."
  fi
fi

# ── The deploy ────────────────────────────────────────────────────────────
echo
echo "Live now:   ${live:-unknown}"
echo "Deploying:  $tag"
if [ "$live" = "$tag" ]; then echo "(That is already live; this restarts it with a backup first.)"; fi
confirm "" || die "Cancelled; nothing changed on the server."

if git cat-file -e "$tag^{commit}" 2>/dev/null; then
  echo "Copying the deploy files from that commit..."
  paths=()
  for f in "${SYNC_FILES[@]}"; do paths+=("deploy/$f"); done
  git archive "$tag" "${paths[@]}" | remote "cd $REMOTE_DIR && tar -x --strip-components=1 && chmod +x *.sh"
else
  echo "That commit isn't in this repository (git fetch?), so the deploy files on the server are left as they are."
fi

remote "
  set -e
  cd $REMOTE_DIR
  umask 077
  grep -v '^WORDWRIGHT_TAG=' .env > .env.tmp || true
  printf 'WORDWRIGHT_TAG=%s\n' '$tag' >> .env.tmp
  mv .env.tmp .env
  chmod 600 .env
  ./deploy.sh
" || die "The deploy did not finish. On the server: docker compose logs --tail 100 api. To go back: see 'Rolling back' in docs/deploy.md."

if command -v curl >/dev/null && curl -fsS --max-time 15 "$SITE_URL/health" >/dev/null; then
  echo "✓ $SITE_URL/health answers. Live: $tag"
else
  echo "The server says it is ready, but $SITE_URL/health did not answer from here. Check it in a browser." >&2
  exit 1
fi
