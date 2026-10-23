# Deploying Wordwright

Production is **one machine** (an UpCloud VM in London; see the decision in [decisions.md](decisions.md)) running two
containers with Docker Compose:

- `api`: the Hono API and its SQLite database (a volume mounted at `/data`).
- `web`: Caddy, which gets the HTTPS certificate, serves the built web app and sends `/api/*` to `api`.

**There must be exactly one `api` container.** The rate limiter lives in its memory and the database is one file; a
second copy would split the limits and fight over the file. Don't scale it.

Setting up the server itself (accounts, firewall, Docker), the domain, DNS and email are in #349; this page is
what runs on it.

## The files

| File                            | What it is                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `Dockerfile`                    | Builds both images (`--target api` and `--target web`).                                         |
| `deploy/compose.yaml`           | The two services, the volumes, the health check, and a cap on log size (the disk is small).     |
| `deploy/Caddyfile`              | HTTPS, security headers, the web app with its fallback page, `/api/*` and `/health` to the API. |
| `deploy/production.env.example` | Every setting production needs. Copy to `deploy/.env` on the server; `.env` is never committed. |
| `deploy/deploy.sh`              | Backs up, pulls, restarts, waits until ready.                                                   |
| `scripts/backup-db.mjs`         | A safe copy of the live database, with old copies removed.                                      |
| `.github/workflows/image.yml`   | Builds the images and pushes them to ghcr.io when you run it.                                   |

`/health` says the process is up (it is published, for uptime monitors). `/ready` says the database is open and every
migration has run; the container's health check uses it, and Caddy does not publish it. The API runs from its
TypeScript with `tsx`, so there is no separate compile step to keep in step with the code.

## Trying it on your own machine

```bash
cd deploy
cp production.env.example .env     # then set SITE_ADDRESS=localhost, PUBLIC_URL=https://localhost, any 32+ character secrets,
                                   # and SMTP_URL=smtp://127.0.0.1:1 (the app only warns that it cannot send)
docker compose up -d --build
curl -k https://localhost/health   # the certificate is Caddy's own, so the browser warns
docker compose down -v             # -v also deletes the trial database
```

## Shipping a build

1. On GitHub: **Actions → Images → Run workflow**, on the commit you want (normally `main` once CI is green). It
   pushes `ghcr.io/jenit/wordwright-api` and `-web`, tagged with the commit hash and `latest`.
2. On the server, in `deploy/`: set `WORDWRIGHT_TAG=<that commit hash>` in `.env` and run `./deploy.sh`.

The images are private. The server needs to be logged in to ghcr.io once, with a token that can only read packages
(GitHub → Settings → Developer settings → personal access token with `read:packages`): `docker login ghcr.io -u <your
GitHub name>`, then paste the token at the prompt. Never put it in a file in this repository or in a chat with an agent.

`deploy.sh` takes a backup before it changes anything, then waits up to a minute for the API's health check. A new
build runs any new migrations when it starts.

## Backups

The database is backed up with `scripts/backup-db.mjs`, which uses SQLite's own backup call. **Don't copy the
`.sqlite` file with `cp`**: the live file is in WAL mode, and a plain copy can miss what has not been written back yet
(the copy this script makes is one self-contained file, and is checked before the script says it worked).

```bash
docker compose exec -T api node /app/scripts/backup-db.mjs /data/backups   # keeps 14 days (BACKUP_KEEP_DAYS)
```

That keeps the copies on the same disk, so they do not survive losing the machine. **Copy them somewhere else**, and
back up the secrets apart from the data (`KEY_ENCRYPTION_SECRET` in particular: without it stored AI keys cannot be
read, and without `SESSION_SECRET` everyone is signed out). Where they go, and the nightly schedule, are in #17 and the
restore rehearsal in #322. Keep the retention short: a deleted account's data should not linger in old copies.

## Rolling back

Migrations only go forward, and a build refuses a database made by a newer one ("created by a newer version of this
app"). So going back to an older build means going back to a database from before it:

1. `docker compose stop api`
2. Set `WORDWRIGHT_TAG` to the older commit hash in `.env`.
3. Replace the database with the backup `deploy.sh` took (the newest in `/data/backups`, dated before the update),
   and delete `wordwright.sqlite-wal` and `-shm` beside it:
   `docker compose run --rm --no-deps api sh -c 'cd /data && cp backups/<file> wordwright.sqlite && rm -f wordwright.sqlite-wal wordwright.sqlite-shm'`
4. `./deploy.sh`

Anything written since that backup is lost, so the sooner you decide the better. If the old build only needs a
configuration fix, change `.env` and run `docker compose up -d` instead; nothing about the data changes.

## Looking at it

```bash
docker compose ps                       # api should say (healthy)
docker compose logs --tail 100 api      # logs hold no request bodies, keys or links; the last 50 MB are kept
```
