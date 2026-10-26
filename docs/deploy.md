# Deploying Wordwright

Read this when you deploy, back up, restore or roll back the server, or set up its email, firewall or Google sign-in.

**Contents:** [Setting up a new server](#setting-up-a-new-server) · [The files](#the-files) · [Trying it on your own machine](#trying-it-on-your-own-machine) · [Shipping a build](#shipping-a-build) · [Backups](#backups) · [Rolling back](#rolling-back) · [Repeating deletions after a restore](#after-a-rollback-or-restore-repeat-the-deletions) · [The firewall, and outgoing mail](#the-firewall-and-outgoing-mail) · [Google sign-in](#google-sign-in) · [Letting people in (the private alpha)](#letting-people-in-the-private-alpha) · [Looking at it](#looking-at-it)

Production is **one machine** (an UpCloud VM in London; see [the decision](adr/go-live-and-operations/production-runs-as-two-containers-on-one-machine.md)) running two
containers with Docker Compose:

- `api`: the Hono API and its SQLite database (a volume mounted at `/data`).
- `web`: Caddy, which gets the HTTPS certificate, serves the built web app and sends `/api/*` to `api`.

**There must be exactly one `api` container.** The rate limiter lives in its memory and the database is one file; a
second copy would split the limits and fight over the file. Don't scale it.

**The API trusts Caddy for the client's address.** The api image sets `TRUST_PROXY=true`, so sign-in and sign-up are also
throttled per address, read from `X-Forwarded-For`. Caddy replaces whatever the client sent there with the address it
saw. That is safe only because the api container publishes no port (`scripts/deploy-compose.test.mjs` checks): keep
it that way, or anyone could set the header. If a CDN or another proxy is ever put in front of Caddy, every request
would seem to come from that proxy and share one allowance: set Caddy's `trusted_proxies` to it first.

The domain and DNS (Gandi), the Scaleway account and the Google sign-in are set up in their own dashboards (#349, #350);
the server itself is set up by a wizard (next section). This page is what runs on it.

## Setting up a new server

Run the wizard on your own computer, from this repository:

```bash
deploy/setup-wizard.sh
```

It walks you through twelve steps and does the typing on the server for you, over SSH. It needs `ssh`, `scp`,
`rsync`, `curl`, `node` and a signed-in `gh`. What it does, in order: checks the DNS record and your SSH key; runs
`deploy/server-setup.sh base` on the server (an account `wordwright` for the app, Docker, a firewall for SSH, 80 and
443, automatic security updates with a restart at 04:30 when one needs it); switches off root login and passwords
once you have shown the new login works; copies the deploy files; runs the Images workflow; gives the server a
read-only token for the private images; makes the two secrets and sends them to the server; takes the Scaleway SMTP
details; takes the Google sign-in ID and secret if you have them; starts the app and checks `https://app.wordwright.io/health`; walks you through checking real email; and
installs a nightly backup timer and fetches a first copy to your computer.

Secrets go from your keyboard to the server and are never written on your computer. The one file it keeps
(`deploy/.env.server-setup`, ignored by git) holds only non-secret answers, so you can stop with Ctrl-C and run it again
where it left off. It keeps secrets the server already has, rather than making new ones: **a new
`KEY_ENCRYPTION_SECRET` would make every saved AI key unreadable.** Read `deploy/server-setup.sh` first if you want to
see exactly what runs as root.

## The files

| File                            | What it is                                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Dockerfile`                    | Builds both images (`--target api` and `--target web`).                                                                            |
| `deploy/compose.yaml`           | The two services, the volumes, the health check, and a cap on log size (the disk is small).                                        |
| `deploy/Caddyfile`              | HTTPS, security headers (with the Content-Security-Policy), the web app with its fallback page, `/api/*` and `/health` to the API. |
| `deploy/production.env.example` | Every setting production needs. Copy to `deploy/.env` on the server; `.env` is never committed.                                    |
| `deploy/deploy.sh`              | Backs up (`backup.sh`), pulls, restarts, waits until ready.                                                                        |
| `deploy/setup-wizard.sh`        | Walks you through setting up a new server (below).                                                                                 |
| `deploy/server-setup.sh`        | What runs as root on the server: `base`, `harden`, `timer`.                                                                        |
| `deploy/backup.sh`              | One backup onto the server's own disk, and off-site if set up; the nightly timer runs it.                                          |
| `deploy/rollback.sh`            | Back to an older build and the database from before the update; says how to repeat the deletions since.                            |
| `deploy/offsite-wizard.sh`      | Sets up the encrypted off-site copy in Scaleway (below).                                                                           |
| `deploy/offsite.sh`             | Uploads, lists, fetches and verifies the off-site copies.                                                                          |
| `scripts/backup-db.mjs`         | A safe copy of the live database, with old copies removed.                                                                         |
| `.github/workflows/image.yml`   | Builds the images and pushes them to ghcr.io when you run it.                                                                      |

**The Content-Security-Policy** in `deploy/Caddyfile` lets the page run only its own files and the one inline script in
`apps/web/index.html`, which it names by hash. Change that script and the page stops applying a saved theme until the hash
is updated too; `pnpm test:scripts` fails until it is. A request to `/api` over 8 MB is refused by Caddy, and the API
refuses anything over 2 MB itself (a picture: over 1 MB) with a message.

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

Those copies are on the server's own disk, so by themselves they do not survive losing the server. Two more things
keep them safe: the encrypted off-site copy below, and the secrets kept apart from the data (`KEY_ENCRYPTION_SECRET`
in particular: without it stored AI keys cannot be read, and without `SESSION_SECRET` everyone is signed out). Keep
the retention short: a deleted account's data should not linger in old copies.

### Off-site copies (Scaleway Object Storage)

`deploy/offsite-wizard.sh` (run on your computer, after the setup wizard) sets this up. It walks you through making a
separate Scaleway project, a private bucket with versioning and an expiry rule, and an API key that reaches only that
project, then writes the settings to `~/wordwright/offsite.env` on the server (mode 600). After that, **every
`backup.sh` run, so every night, also uploads the new backup** with `deploy/offsite.sh`.

- **Encrypted first.** The wizard makes an encryption password and a salt and shows them once. **Put them in your password
  manager** next to `KEY_ENCRYPTION_SECRET`: without them the off-site backups cannot be opened by anyone, you included.
- **Storage class: Standard Multi-AZ** (leave the size boxes at 0: they are only a cost estimate). Not Glacier, which is
  archive storage: slow and costly to get a backup back from, with minimum storage periods that our 30-day expiry would
  not meet.
- **The lifecycle rule** (set on a separate page after the bucket is created), for all objects: expire the current version
  after **30** days; non-current versions **7** days after they become non-current, with "non-current versions to
  retain" at **0** (a higher number keeps deleted backups for ever, since each backup name has at most one old version);
  and expire delete markers that have no non-current versions.
- **Retention.** The bucket's rule expires backups after 30 days (and old versions after 7), so a deleted account's
  data can remain in the backups for up to about 37 days. Say so in the data map (#320). The server keeps 14 days.
- **A failed upload** leaves the local backup in place but makes the nightly run fail (`systemctl status
wordwright-backup.service`, `journalctl -u wordwright-backup.service`). A 403 means the key or its policy, a 404 the
  bucket name or region. A mistyped bucket name is an error, never a new bucket (the wizard turns bucket creation off).

The reasons for these choices (why Scaleway, why encrypt first, why the key may delete but the bucket is versioned, why rclone is pinned) are in [the decision](adr/go-live-and-operations/off-site-backups-scaleway-object-storage-encrypted-before-upload.md).

On the server, in `~/wordwright`:

```bash
./offsite.sh list                  # the backups in the bucket, with their real names
./offsite.sh fetch <name>          # bring one back to ~/restored, decrypted
./offsite.sh verify                # fetch the newest, check the database opens and is intact, delete the copy
```

### Restoring from the off-site copy

If the server is fine but the database is not, fetch a backup and roll back to it (rollback.sh takes any file):

```bash
./offsite.sh list
./offsite.sh fetch wordwright-20261023-023000.sqlite
./rollback.sh <the build you want> ~/restored/wordwright-20261023-023000.sqlite
```

If the server is gone: make a new one with `deploy/setup-wizard.sh`, then before anyone uses it, stop the app, put your
**saved** `KEY_ENCRYPTION_SECRET` (and `SESSION_SECRET`) into `~/wordwright/.env` in place of the new ones the wizard
made (a new key secret makes every stored AI key unreadable), run `deploy/offsite-wizard.sh` and answer **no** to "is
this the first time" to enter the saved encryption password and salt, then fetch the newest backup and roll back to it as
above. This path is written but has not been practised yet: the restore rehearsal in #322 should do it once.

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

### After a rollback or restore, repeat the deletions

Going back to an older database brings back anyone who deleted their account since that backup, which they did not agree
to. The app therefore notes every deletion (the time and the account's id, nothing personal) in `deletions.jsonl` in the
data volume, which a rollback does not touch; it keeps 45 days of them, and `backup.sh` copies it into `~/backups` and the
off-site copy ([the decision](adr/go-live-and-operations/a-list-of-account-deletions-outside-the-database-repeats-them-after-a-restore.md)).
Right after any rollback or restore, **before anyone uses the app**, in `~/wordwright`, with the time the backup was taken
(`rollback.sh` prints the whole command, taking the time from the backup's name):

```bash
docker compose exec api ./node_modules/.bin/tsx src/replay-deletions-cli.ts 2026-10-23T02:30:00Z          # shows what it would do
docker compose exec api ./node_modules/.bin/tsx src/replay-deletions-cli.ts 2026-10-23T02:30:00Z --apply  # does it
```

It prints how many were recorded since that time, how many it deleted again, and how many were not in this database (people who
joined after the backup, or were already gone). It is safe to run twice. The people who left will have lost nothing else:
only deletions are repeated, and anything else written after the backup is lost, as `rollback.sh` says.

If the server was lost too, restore as above and then bring the list back before you replay: `./offsite.sh fetch
deletions.jsonl`, then `docker compose run --rm --no-deps -T api sh -c 'cat >> /data/deletions.jsonl' < ~/restored/deletions.jsonl`.
Without a list, the deletions cannot be repeated: say so in the breach log's terms if it matters ([breach-procedure.md](breach-procedure.md)), and treat anyone who wrote to `hello@` asking to be deleted as still to be deleted.

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

## Google sign-in

Optional: without `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` the app works with email sign-in only (#350).

**Where it stands (23 Oct 2026):** the Google Cloud project, consent screen and OAuth client exist, with the app in
**Testing** (not published). The privacy notice and terms links on the consent screen wait for #321, and the proper
verification waits until after #320 and #321.

### The decision: stay in Testing for the private alpha

The app asks only for `openid`, `email` and `profile`, which Google counts as non-sensitive, so verification is a
brand and policy review rather than a security assessment. It is still not needed yet: while the publishing status is
**Testing**, up to 100 listed test users can sign in, and the alpha is invitation-only anyway (#328). What testing
costs: signing in shows an "unverified app" page that a test user passes with **Continue**, and anyone not on the list
is turned away by Google before the app sees them. **Add each alpha writer's Google address to the test users first**
(Google Auth Platform → Audience → Test users). Move to **In production** and submit for verification when the alpha
passes 100 people, or when the warning page puts people off, whichever is first; it can take days or weeks, so start
once the privacy notice and terms are live.

### The Google Cloud settings

- **Project** `Wordwright`; **consent screen** type External, app name `Wordwright`, support and developer contact emails.
- **Scopes:** `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. Add no others.
- **OAuth client** (Web application): authorised redirect URI exactly
  `https://app.wordwright.io/api/auth/oauth/google/callback` (`PUBLIC_URL` plus the path; a trailing slash or `http` makes
  Google answer `redirect_uri_mismatch`). No JavaScript origin is needed: the app uses the code flow.

### Putting the client on the server

The ID and secret live only in `~/wordwright/.env` on the server, never in the repository or a chat. Run
`deploy/setup-wizard.sh`: its Google stage asks for the client ID, then the secret (hidden), and sends both to the
server like the other secrets; re-running it keeps what the server has unless you say to replace it. Then apply them
with `docker compose up -d` in `~/wordwright` (the wizard's first deploy does this itself; a plain `restart` does not
read `.env` again). Or edit by hand: `nano .env`, set both lines (the app refuses to start with only one), then
`docker compose up -d`. Keep the secret in your password manager too, apart from the data.

### Checking it

1. Sign in with Google as a test user who has no account yet. A new account should be created, and start as `waiting`.
2. Sign in again as the same person: it should go straight in, to the same account.
3. Sign in with a Google account that is not on the test list: Google should refuse with "access blocked".
4. If Google shows `redirect_uri_mismatch`, compare the URI in the error with the one above.

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

## Letting people in (the private alpha)

New accounts wait until an admin approves them (`ACCOUNT_APPROVAL=required`, the default). Put the admin
address in `ADMIN_EMAILS` in `.env` (`admin@wordwright.io`, a real inbox: it is the only way in). On the first start the
server creates an **Admin** account for the _first_ address, with a confirmed email, approved, and no password. Open
`/forgot-password`, ask for a link for that address, and choose a password: you are then signed in as an admin, with an
**Accounts** link at the foot of the menu. Admin is never set in the app. To give or take it away later, on the server:

```bash
docker compose exec api ./node_modules/.bin/tsx src/admin-cli.ts grant someone@example.com
docker compose exec api ./node_modules/.bin/tsx src/admin-cli.ts revoke someone@example.com
```

On a server whose `.env` already exists (the wizard does not write `ADMIN_EMAILS`), set it and recreate the container:

```bash
cd ~/wordwright
grep -q '^ADMIN_EMAILS=' .env && sed -i 's|^ADMIN_EMAILS=.*|ADMIN_EMAILS=admin@wordwright.io|' .env || echo 'ADMIN_EMAILS=admin@wordwright.io' >> .env
docker compose up -d
```

Your own account stops being listed there once Admin can sign in; then take its admin role away with the `revoke`
command above. An account that already exists becomes an admin (and is approved) the next time it is used, once its email is confirmed.

Approving and declining email the person, so email has to be working first (see above). Everyone who had an account
before approval began is already approved.

## Looking at it

```bash
docker compose ps                       # api should say (healthy)
docker compose logs --tail 100 api      # logs hold no request bodies, keys or links; the last 50 MB are kept
```
