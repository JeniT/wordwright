# Running Wordwright in production

Read this when something is wrong with the live service, when you set up or test its monitoring, when a secret may have
leaked, before the restore rehearsal, and when you change a rate limit. The commands themselves (deploying, backing up,
restoring, rolling back, email) are in [deploy.md](deploy.md); if personal data may have been exposed, go straight to
[breach-procedure.md](breach-procedure.md).

**Contents:** [Where it stands](#where-it-stands) · [Monitoring and alerts](#monitoring-and-alerts) ·
[A weekly look](#a-weekly-look) · [When something is wrong](#when-something-is-wrong) ·
[Who is told what](#who-is-told-what) · [Secrets](#secrets) · [Deploys, migrations and rollback](#deploys-migrations-and-rollback) ·
[The restore rehearsal](#the-restore-rehearsal) · [Limits](#limits) · [Capacity](#capacity) · [Email](#email)

## Where it stands

Written 27 October 2026 for #322. Done on the real server: a deploy and a rollback rehearsal (23 October 2026), and
`./offsite.sh verify`. Still to do, all by the owner, before the alpha has real accounts:

- [ ] Choose a monitoring service and set up the two checks below (#414), then test both alerts.
- [ ] The restore rehearsal, including a fresh server, and the breach procedure on paper ([below](#the-restore-rehearsal)).
- [x] Scaleway's email log retention: answered in [data-map.md](data-map.md) (#407).

Later, for the beta: tighten DMARC to `p=quarantine` (#415).

## Monitoring and alerts

There is one server and one person running it, so monitoring is two outside checks that email (or text) the owner. Any
service that does both kinds will do; which one is the owner's choice. Prefer one that keeps its data in the UK or EU,
since a monitor sees nothing personal but is still a service we rely on.

| Check         | What it watches                                                                                                   | Set it to                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Uptime**    | `https://app.wordwright.io/health` answers 200. It catches the server, Caddy, the API or the certificate failing. | Every 5 minutes; alert after 2 failures in a row. If the service offers a certificate-expiry warning, turn it on. |
| **Heartbeat** | The nightly backup pings a private URL when it has worked; the monitor alerts when a day passes without a ping.   | Expect a ping every 24 hours, with 3 hours' grace (the backup runs at 02:30, so an alert arrives in the morning). |

The heartbeat covers more than backups. `deploy/backup.sh` pings only after the backup, the copy and the off-site upload
have all worked, and it refuses to back up when the disk is 90% full or more (`BACKUP_MAX_DISK_PERCENT`). So a missed
heartbeat means one of: the backup failed, the off-site upload failed, the disk is filling, the timer stopped, or the
server is gone. [Below](#a-missed-heartbeat) says how to tell which.

**Setting up the heartbeat.** The monitor gives you a URL. Anyone who has it can send a ping and hide a failure, so treat
it like a password. The server's copy of `backup.sh` predates the heartbeat until you send the new one; from this
repository on your computer: `scp deploy/backup.sh wordwright@<server>:wordwright/`. Then, on the server:

```bash
cd ~/wordwright
read -rsp 'Heartbeat URL: ' url && echo && (umask 077 && echo "HEARTBEAT_URL=$url" > monitor.env)
./backup.sh       # by hand once: the monitor should show a ping
```

**Testing the alerts** (do both once after setting them up, and after changing the monitor):

1. Uptime: `docker compose stop web`, wait for the alert (about 10 minutes), then `docker compose start web` and check
   that the monitor says it is back.
2. Heartbeat: set the check's period to 1 hour with no grace, wait for the alert, then set it back to 24 hours and
   3 hours. (Running `BACKUP_MAX_DISK_PERCENT=1 ./backup.sh` shows the disk message, and sends no ping.)

Write the date each alert was tested in [Where it stands](#where-it-stands).

**Not monitored**, and why that is acceptable for the alpha: unexpected errors (500s) appear only in the log, so they
are part of the weekly look; email that bounces or is blocked shows only in Scaleway's console; an AI provider's outage
is the writer's to see (the app says so) and not ours to fix.

## A weekly look

Five minutes, on the server in `~/wordwright`:

```bash
docker compose ps                                       # both up; api (healthy)
docker compose logs --since 168h api | grep -c failed   # unexpected errors this week; 0 is normal
docker compose logs --since 168h api | grep failed | sort | uniq -c | sort -rn | head
df -h /                                                 # the disk is 20 GB
systemctl list-timers wordwright-backup.timer --no-pager
docker system df                                        # old images take the space; see "The disk is filling"
```

Each failed line names the method, path, error type and stack frames, never the message ([deploy.md](deploy.md#logs)). The same line many times is a bug: file it with the path and the
frames. Also glance at Scaleway's Transactional Email page for bounces and blocks.

## When something is wrong

### The site is down (uptime alert)

1. `curl -sS -o /dev/null -w '%{http_code}\n' https://app.wordwright.io/health` from your own computer. If it works, the
   monitor or the network between was at fault: watch for a second alert.
2. `ssh` in. If you cannot, the server itself is down: look at UpCloud's control panel (is it running? its console?)
   and UpCloud's status page. A restart from the panel is safe; the app comes back with the server.
3. `cd ~/wordwright && docker compose ps`. If a container is stopped or restarting: `docker compose logs --tail 100 api`
   (or `web`). Then `docker compose up -d`.
4. If the api says `unhealthy` straight after a deploy, the new build is at fault: roll back ([deploy.md](deploy.md#rolling-back)).
5. If Caddy's log mentions certificates, check that port 80 is still open in both firewalls ([deploy.md](deploy.md#the-firewall-and-outgoing-mail)).

### A missed heartbeat

```bash
systemctl status wordwright-backup.service --no-pager
journalctl -u wordwright-backup.service --since yesterday --no-pager
```

- **"Not backing up: the disk is N% full"**: see the next section, then run `./backup.sh` by hand.
- **An off-site error** (403, 404, rclone): the local backup is there; see _A failed upload_ in
  [deploy.md](deploy.md#off-site-copies-scaleway-object-storage).
- **A curl error at the end**: the backup worked and only the ping failed; check `monitor.env` and the monitor's status.
- **Nothing ran**: `sudo systemctl enable --now wordwright-backup.timer`.
- **The server is gone**: restore onto a new one ([deploy.md](deploy.md#restoring-from-the-off-site-copy)).

### The disk is filling

```bash
df -h / && docker system df && du -sh ~/backups
docker image prune -a --filter "until=336h"   # images not used by a running container and over 14 days old
```

At 90% full `backup.sh` refuses to run, and so does `deploy.sh`, which backs up first: free space before deploying.
Old images are the usual cause: each deploy pulls two. Logs are capped (50 MB a container) and backups are kept 14 days.
If the database itself is large, `docker compose exec api du -sh /data`; tell the owner before deleting anything in
`/data` (the `replaced-*` files from a rollback can go once the rollback is known to be good).

### Writers say the AI does not work

Each writer uses their own key with their own provider, so this is usually theirs to fix, and the app tells them how:

| They see                                                                             | It means                                                    | What to do                                                                                      |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| "Your AI provider didn't accept your key. Check it in your AI key settings."         | The provider refused the key (revoked, expired, no credit). | Nothing on the server. They replace the key on Your AI.                                         |
| "Your AI provider is limiting requests for your key right now. Try again …"          | The provider's own rate limit for their account.            | Wait. Their provider's console shows their limits.                                              |
| "The AI provider returned an error" / "had a problem. Try again in a moment."        | The provider failed, or could not be reached.               | Look at the provider's status page (Anthropic: status.anthropic.com).                           |
| "You’re asking your AI very quickly" / "sending messages" / "searching very quickly" | Our own throttle ([Limits](#limits)).                       | Wait a few minutes. If a real writer meets it in ordinary use, the limit is too low: change it. |

If **every** writer's AI fails at once and the provider is fine, the server cannot reach it: from the server,
`docker compose exec api node -e "fetch('https://api.anthropic.com').then(r => console.log(r.status))"` (any status
means it is reachable; an error means DNS or the outgoing firewall).

### Email does not arrive

See [deploy.md](deploy.md#if-email-does-not-send). Sign-up, password resets and invitations all depend on it, so while it
is broken new people cannot get in; people already signed in are not affected.

### Data may have been exposed

Stop and follow [breach-procedure.md](breach-procedure.md). The 72 hours start when you are reasonably sure.

## Who is told what

| What happened                                    | Who is told                                                                        | How, and when                                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Down for under an hour, nothing lost             | No one                                                                             | Note it here if it keeps happening.                                                                                    |
| Down for over an hour                            | The alpha writers                                                                  | An email from `hello@wordwright.io` once it is back: when, for how long, and that nothing was lost.                    |
| A restore or rollback lost writing               | Everyone who used the app after the backup's time                                  | An email, as soon as it is back: the time their work goes back to, so they can redo or paste back what they have.      |
| Writers' saved AI keys deleted (secret rotation) | Everyone who had a key saved                                                       | An email: their key was deleted, why, and that they should add it again (and revoke it with their provider if leaked). |
| Personal data exposed                            | ICO and the people affected, as [breach-procedure.md](breach-procedure.md) decides | Within 72 hours for the ICO.                                                                                           |
| A processor's problem (UpCloud, Scaleway, Gandi) | Depends on the effect; treat as one of the rows above                              | Their status page or email starts it.                                                                                  |

The app has no banner for announcements, so email is the only channel. Write in plain words and follow the
[style guide](style-guide.md): what happened, what it means for them, what they should do.

## Secrets

Every secret lives in `~/wordwright/.env` or `offsite.env`/`monitor.env` on the server (mode 600) and in the owner's
password manager, never in the repository or a chat. To apply a change to `.env`: `docker compose up -d` (a plain
`restart` does not read `.env` again).

| Secret                                | If it leaks or must change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SESSION_SECRET`                      | Set a new one (`openssl rand -base64 48`) and `docker compose up -d`. Everyone is signed out; nothing else is lost.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `KEY_ENCRYPTION_SECRET`               | There is no rotation tool (#169), so the keys it protects are deleted instead, with the app stopped so no key is saved in between: (1) put a new secret in `.env`; (2) `docker compose stop api`; (3) `docker compose run --rm --no-deps api ./node_modules/.bin/tsx src/forget-ai-keys-cli.ts` to count them, then the same with `--apply`; (4) `docker compose up -d`; (5) email those writers (above). A key left from the old secret cannot be read under the new one, and every AI call with it would fail. If the database may also have leaked, this is a breach. |
| `SMTP_URL` (Scaleway API secret key)  | Make a new API key in the Scaleway project with Transactional Email permissions, put it in `SMTP_URL`, `docker compose up -d`, check the log says `SMTP connection verified`, then delete the old key in Scaleway.                                                                                                                                                                                                                                                                                                                                                       |
| `GOOGLE_CLIENT_SECRET`                | Google Cloud → the OAuth client → add a new secret, put it in `.env`, `docker compose up -d`, then disable the old one.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Off-site key (in `offsite.env`)       | Make a new Scaleway API key with the same policy, run `deploy/offsite-wizard.sh` again (answer **no** to "first time"), then delete the old key.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Off-site encryption password and salt | Old backups stay readable only with the old pair, so keep it until they expire (30 days). Set a new pair with the wizard; new backups use it.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `HEARTBEAT_URL` (in `monitor.env`)    | Make a new check (or regenerate its URL) in the monitor and write the new `monitor.env`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| The ghcr.io read token                | Revoke it on GitHub, make a new `read:packages` token, `docker login ghcr.io` again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| An SSH key                            | Remove its line from `~/.ssh/authorized_keys` for `wordwright` (and any other account), from another key or UpCloud's console.                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Deploys, migrations and rollback

How to deploy and roll back is in [deploy.md](deploy.md#shipping-a-build). What to know when it goes wrong:

- **Migrations run when the new api starts**, inside one transaction each; if one fails the api does not become
  healthy and `deploy.sh` stops with an error. The old database is untouched by a failed migration, and `deploy.sh`
  took a backup first.
- **The rollback decision:** if the new build is unhealthy, or a core action (sign-in, saving a draft) fails for
  everyone, roll back at once ([deploy.md](deploy.md#rolling-back)); the sooner, the less is lost. If one feature is
  broken and nothing is being lost, a fix forward is usually better.
- **After any rollback or restore, repeat the deletions before anyone uses the app**
  ([deploy.md](deploy.md#after-a-rollback-or-restore-repeat-the-deletions)), then tell people what was lost (above).

## The restore rehearsal

Do this once before the alpha has real accounts, and again after any change to backups. It practises the path
that has not been tried: losing the server.

1. On the live server, register a test account and write a draft in it. Make sure your own admin account has an AI key
   saved.
2. Run a backup (`./backup.sh`), so it holds the test account, then confirm the off-site copy: `./offsite.sh verify`.
3. Now delete the test account in the app. Note the time.
4. Make a **new** server with `deploy/setup-wizard.sh` on a spare name (or the real one, if the old server is retired
   for the exercise), and follow [Restoring from the off-site copy](deploy.md#restoring-from-the-off-site-copy): saved
   secrets in, off-site wizard with the saved password and salt, fetch the backup from step 2, roll back to it, bring
   back `deletions.jsonl`, replay the deletions.
5. Check: `/ready` answers; you can sign in as admin; your saved AI key still works (Your AI shows it, and a brainstorm
   message gets a reply), which proves `KEY_ENCRYPTION_SECRET` was restored; and the test account, which was in the
   backup, **cannot** sign in and is not in the admin list, which proves the deletion was repeated.
6. Time each step. Throw the spare server away.
7. Walk the [breach procedure](breach-procedure.md#practise-it) on paper, pretending `.env` leaked, and time it.

| Date | What was rehearsed | How long | What went wrong, and the fix |
| ---- | ------------------ | -------- | ---------------------------- |
| —    | Not yet            |          |                              |

## Limits

Every limit is in `apps/api/src/app.ts`, kept in the api's memory (one api container, so one set of counts; a restart
resets them). "Per person" is per signed-in account; "per address" is per network address, from Caddy.

| What                                       | Limit                                              | Why                                                                       |
| ------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------- |
| Sign-ups, whole site                       | 30 an hour (`SIGNUPS_PER_HOUR`)                    | Each sends an email and adds an account. The alpha also needs approval.   |
| Sign-ups per address                       | 5 an hour                                          | One person making many.                                                   |
| Sign-in / password reset                   | 10 per 15 minutes per account; 30 / 10 per address | Password guessing.                                                        |
| Confirmation emails                        | 3 an hour per account                              | Email to one inbox.                                                       |
| Publication invitations                    | 20 a day per person; 5 a day to any one address    | Each emails a stranger from our domain.                                   |
| Review invitations                         | 5 a day to any one address                         | As above.                                                                 |
| Handover offers                            | 20 a day per person                                | As above.                                                                 |
| Admin decisions                            | 120 an hour per admin                              | Each emails the person.                                                   |
| Brainstorm messages                        | 30 per 10 minutes per person                       | The writer's money and our time.                                          |
| Critique and Rephrase, together            | 30 per 10 minutes per person                       | As above; not a quota on writing (the looks limit is that, for critique). |
| Research searches                          | 10 an hour per person                              | A bigger bill, and the server fetches several sites.                      |
| Saving an AI key / listing models          | 10 per 15 minutes / 30 a minute per person         | Each calls the provider; not a key-checking oracle.                       |
| Link lookups (titles of pages)             | 30 a minute per person                             | Each contacts someone else's website.                                     |
| New sources (feeds) / fetching their posts | 30 / 120 an hour per person                        | As above.                                                                 |
| Exports                                    | 5 an hour per person                               | Real work for the server.                                                 |
| Changing username                          | 5 a day per person                                 | Usernames appear in links.                                                |
| Request size                               | 2 MB (a picture 1 MB) in the api; 8 MB at Caddy    | Memory.                                                                   |

A refused request gets a 429 and a sentence saying to wait. Signs of abuse to look for in the weekly look: many
`429`s from one path, or a burst of sign-ups waiting for approval from addresses you do not know (decline them).

## Capacity

The server is UpCloud's smallest (1 CPU, 2 GB memory, 20 GB disk). For the private alpha (tens of writers, approved one
by one) that should be plenty: SQLite on a local disk handles far more reads and writes than tens of people make, and
an AI request is mostly waiting for the provider, not using the CPU. What would run out first, and how to see it:

- **Disk**: images, backups and the database. The heartbeat fails at 90%.
- **Memory**: many AI replies and exports at once. `docker stats --no-stream` in the weekly look; if the api stays
  above about 1 GB, move to the next plan (a resize in UpCloud's panel, a few minutes' downtime).

These are judgements, not measurements: nothing has been load-tested. Look again before opening sign-ups beyond the alpha.

## Email

Deliverability was checked on 23 October 2026 (#349): `dkim=pass` for `wordwright.io`, `spf=pass` and `dmarc=pass`, with
DMARC at `p=none`. How to check again is in [deploy.md](deploy.md#checking-deliverability). Once two weeks of DMARC
reports show only our own mail passing, change the DMARC record at Gandi to `p=quarantine` and check a sign-up email
again (#415). How long Scaleway keeps sending logs and message content is in [data-map.md](data-map.md).
