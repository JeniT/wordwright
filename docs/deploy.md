# Deploying Wordwright

Production is **one machine** (an UpCloud VM in London; see the decision in [decisions.md](decisions.md)) running two
containers with Docker Compose:

- `api`: the Hono API and its SQLite database (a volume mounted at `/data`).
- `web`: Caddy, which gets the HTTPS certificate, serves the built web app and sends `/api/*` to `api`.

**There must be exactly one `api` container.** The rate limiter lives in its memory and the database is one file; a
second copy would split the limits and fight over the file. Don't scale it.

The domain and DNS (Gandi), the Scaleway account and the Google sign-in are set up in their own dashboards (#349, #350);
the server itself is set up by a wizard (next section). This page is what runs on it.

## Setting up a new server

Run the wizard on your own computer, from this repository:

```bash
deploy/setup-wizard.sh
```

It walks you through eleven steps and does the typing on the server for you, over SSH. It needs `ssh`, `scp`,
`rsync`, `curl`, `node` and a signed-in `gh`. What it does, in order: checks the DNS record and your SSH key; runs
`deploy/server-setup.sh base` on the server (an account `wordwright` for the app, Docker, a firewall for SSH, 80 and
443, automatic security updates with a restart at 04:30 when one needs it); switches off root login and passwords
once you have shown the new login works; copies the deploy files; runs the Images workflow; gives the server a
read-only token for the private images; makes the two secrets and sends them to the server; takes the Scaleway SMTP
details; starts the app and checks `https://app.wordwright.io/health`; walks you through checking real email; and
installs a nightly backup timer and fetches a first copy to your computer.

Secrets go from your keyboard to the server and are never written on your computer. The one file it keeps
(`deploy/.env.server-setup`, ignored by git) holds only non-secret answers, so you can stop with Ctrl-C and run it again
where it left off. It keeps secrets the server already has, rather than making new ones: **a new
`KEY_ENCRYPTION_SECRET` would make every saved AI key unreadable.** Read `deploy/server-setup.sh` first if you want to
see exactly what runs as root.

## The files

| File                            | What it is                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `Dockerfile`                    | Builds both images (`--target api` and `--target web`).                                         |
| `deploy/compose.yaml`           | The two services, the volumes, the health check, and a cap on log size (the disk is small).     |
| `deploy/Caddyfile`              | HTTPS, security headers, the web app with its fallback page, `/api/*` and `/health` to the API. |
| `deploy/production.env.example` | Every setting production needs. Copy to `deploy/.env` on the server; `.env` is never committed. |
| `deploy/deploy.sh`              | Backs up (`backup.sh`), pulls, restarts, waits until ready.                                     |
| `deploy/setup-wizard.sh`        | Walks you through setting up a new server (below).                                              |
| `deploy/server-setup.sh`        | What runs as root on the server: `base`, `harden`, `timer`.                                     |
| `deploy/backup.sh`              | One backup onto the server's own disk; the nightly timer runs it.                               |
| `deploy/rollback.sh`            | Back to an older build and the database from before the update.                                 |
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

The wizard installs a timer that runs `deploy/backup.sh` at 02:30 every night: the script above, then a copy of the
result into `~/backups` on the server (14 days kept; `BACKUP_KEEP_DAYS` changes it). Fetch them with
`rsync -a wordwright@<server>:backups/ <a folder on your computer>/`.

Those copies are still on the server's disk, so they do not survive losing the machine until you fetch them. **Copy them somewhere else regularly**, and
back up the secrets apart from the data (`KEY_ENCRYPTION_SECRET` in particular: without it stored AI keys cannot be
read, and without `SESSION_SECRET` everyone is signed out). Where they go, and the nightly schedule, are in #17 and the
restore rehearsal in #322. Keep the retention short: a deleted account's data should not linger in old copies.

## Rolling back

Migrations only go forward, and a build refuses a database made by a newer one ("created by a newer version of this
app"). So going back to an older build means going back to a database from before it. On the server, in `~/wordwright`:

```bash
./rollback.sh <older commit hash>            # uses the newest backup in ~/backups: the one deploy.sh took before the update
./rollback.sh <older commit hash> <file>     # or name a backup
```

It shows which build and which backup (with its time), says that anything written after that time will be lost, and
waits for you to type `rollback`. Then it stops the app, **moves** the current database aside to `/data/replaced-<time>`
in the volume (nothing is deleted), puts the backup in its place, sets `WORDWRIGHT_TAG` in `.env`, and runs
`./deploy.sh`. The sooner you decide, the less is lost. The backup is put in by streaming it into the container, so it
works whoever owns the file on the server.

Find the older hash in the Images runs on GitHub (Actions → Images), or the line `WORDWRIGHT_TAG=` in your notes from the
last deploy. If the old build only needs a configuration fix, change `.env` and run `docker compose up -d` instead;
nothing about the data changes.

A rehearsal on the real server is part of #17: deploy a build, register a test account, roll back to the previous build,
and check the test account is gone and the app is healthy. Try it before the alpha has real accounts.

## The firewall, and outgoing mail

Two firewalls apply on UpCloud: the one in the control panel (outside the machine) and `ufw` on it (set up by
`server-setup.sh`, the same ports). Both must allow what the app needs.

**In UpCloud's control panel** (server → Firewall):

| Direction | Allow                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| Incoming  | TCP 22 (SSH), TCP 80 (Caddy needs it to get and renew the certificate), TCP 443, UDP 443 (HTTP/3), and ICMP. |
| Outgoing  | Everything. Leave it open.                                                                                   |

Why outgoing stays open: the server must reach GitHub's registry (image pulls), Docker and Ubuntu (updates), the
certificate authority, each writer's AI provider (the app calls it with their own key), and any website a writer adds as
a source or feed, all on 80 and 443, plus DNS and time sync. Restricting it to a short list would protect little, because
ordinary HTTPS to anywhere has to stay open, and would risk failures that are hard to trace. The app guards its own
fetches against internal addresses (#318). The firewall rules are per family: if you add an AAAA (IPv6) record for the
site, add matching IPv6 rules too.

What caught us out the first time:

- **A trial account cannot edit the firewall.** Until a payment is made, the rules are fixed and blocking, and the
  panel does not say why changing them fails.
- **Once the limits are lifted, the firewall resets** to "block all incoming, allow all outgoing except SMTP port 25",
  so the incoming rules above have to be added again.
- **Port 25 is blocked on new accounts** and UpCloud only opens it on request. The app doesn't use it: it sends through
  Scaleway on **port 465** (SMTP over TLS), which the default rules allow once the account is out of trial.

### If email does not send

```bash
cd ~/wordwright
docker compose logs --tail 80 api | grep -i email
```

The app checks its SMTP connection when it starts, and logs each failed send (the user ID and an error code, never the
link). What the code means:

| In the log                 | Meaning, and what to do                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SMTP connection verified` | The login works. If mail still doesn't arrive, look at Scaleway's sending log for blocked or bounced messages.                                                                                                                              |
| `ETIMEDOUT`, `during CONN` | The server can't reach Scaleway at all: a network or firewall problem, not credentials. Test with `nc -vz -w 5 smtp.tem.scaleway.com 465`. If it times out, check the firewall above (outgoing must be allowed).                            |
| `EAUTH`                    | Connected, but the login was refused. The username must be the Scaleway **Project ID** (not an email address or an API access key), and the password the **secret key** of an API key with Transactional Email permissions in that project. |
| `ESOCKET`, or a TLS error  | A port that doesn't match the encryption. Scaleway: 465 and 2465 are SSL, 587 is STARTTLS. The app's URL is `smtps://…:465`.                                                                                                                |

To change the settings, run `deploy/setup-wizard.sh` again (decline the image build and the token; it keeps the secrets
the server already has), or edit `SMTP_URL` in `~/wordwright/.env` and run `docker compose up -d`. A plain `docker
compose restart` does not read `.env` again. Percent-encode anything unusual in the username or password.

To test the credentials without the app, type the secret key at curl's prompt so it stays out of your shell history:
`curl -v --url 'smtps://smtp.tem.scaleway.com:465' --user '<project id>'`. A line starting `235` is success, `535` a
refusal.

### Checking deliverability

After any change to the sender or the DNS, sign up with a Gmail (or other) address and read the message's headers
(Gmail: ⋮ → Show original). Look for `dkim=pass` for `wordwright.io`, `spf=pass` and `dmarc=pass`. The first
real check (23 Oct 2026, through Gandi's forwarding to Gmail) passed all three, with DMARC at `p=none`; tightening that to
`quarantine` once a couple of weeks of reports have come in clean is a later step (#322).

## What the logs hold

Production logs must hold no request bodies, AI keys, tokens, reset or invitation links, or writing. What is there:

- **The app** (`docker compose logs api`): start-up lines (the SMTP check, the address it listens on), the method and path
  of a request that failed with an unexpected error plus the error's **type, code and stack frames, never its message**
  (library messages can quote a request or a key), a failed email as an error code and the user's ID (never the address
  or the link), and the type of an AI provider error. Paths contain publication IDs and usernames, so the logs are
  personal data, if mildly so: they are capped at 50 MB per container and rotate (`compose.yaml`).
- **Caddy** (`docker compose logs web`): start-up and certificate lines, and errors (which can include a visitor's IP
  address). It writes no access log.
- **Nothing sensitive travels in a URL**: tokens and keys go in request bodies, and only the path is ever logged.

Two tests keep it so: an unexpected error is logged without its message, and every file that writes to the log is on a
reviewed list (`apps/api/src/errors.test.ts`), so a new log line forces a look at what it prints.

## Looking at it

```bash
docker compose ps                       # api should say (healthy)
docker compose logs --tail 100 api      # logs hold no request bodies, keys or links; the last 50 MB are kept
```
