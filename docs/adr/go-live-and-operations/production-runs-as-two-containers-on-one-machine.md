# Production runs as two containers on one machine (#17)

- **The API runs from its TypeScript with `tsx`**, as it does in development. The workspace packages (`@wordwright/core`,
  `@wordwright/prompts`) are TypeScript too, so a separate compile step would need its own bundling and be one more thing
  that differs from what the tests run. `tsx` therefore moved from a dev to a runtime dependency (about a second more at
  start-up). Revisit if start-up time or image size ever matters.
- **Caddy serves the web app and proxies `/api`**, so the API did not need to learn to serve files, and the certificate
  and redirect from HTTP are Caddy's job. The `web` image is Caddy with the built files inside; both images come from one
  `Dockerfile`. Only `/health` is published among the API's own paths: `/ready` is for the containers' health check and
  answers 404 outside (otherwise the web app's fallback page would answer it with a 200, which tells a monitor nothing).
- **Images are built in CI and pulled** (ghcr.io, private), never built on the 20 GB server. The workflow is run by hand
  for the commit to ship, so a deploy is a decision and every push to `main` does not build two images. It uses only the
  `docker` command, not third-party actions. Images are tagged with the commit, so a rollback names exactly one build.
- **Rolling back means restoring a backup**, because migrations only go forward and a build refuses a newer database.
  `deploy.sh` takes a backup before every update for that reason.
- **Backups use SQLite's backup call** (`scripts/backup-db.mjs`), not a file copy, and the copy is made one self-contained
  file and checked. Getting the copies off the machine, and the schedule, are #17's remaining items and #322.
- **No Content-Security-Policy yet.** Caddy sends HSTS (one week to start), `nosniff`, a frame ban, a referrer policy and a
  permissions policy. A CSP that would not break the editor needs care and belongs to the security review (#317).
