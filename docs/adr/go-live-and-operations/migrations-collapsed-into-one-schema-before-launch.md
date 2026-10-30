# Migrations collapsed into one initial schema before the first invitations (#308)

## Decision

`MIGRATIONS` in `apps/api/src/db/database.ts` held one folded schema and twenty appended steps. Just before the first
production deploy they became **one entry**: the schema those twenty-one steps produced. This is the one place the
"append-only" rule was set aside on purpose, and it happens once. From the first deploy on, every change is appended
as a new entry and applied entries are never touched again.

The same sweep removed the redirects in `apps/web/src/router.ts` that only served addresses nobody had bookmarked
(`/search`, `/inspiration`, `/articles`, `/ideas`, `/ideas/new`, `/describe`, `/research/find`, `/brainstorm`,
`/publish`). The two that are part of how the app is used stay: `/account` and `/p/:id/settings` lead to their first
page. The server's redirect for a renamed publication stays too, since people do bookmark and share those.

## Why

Nobody had been invited, and the live app held only the owner's data. Every migration and redirect added during
development was cost with no one to benefit: more steps to run on a fresh database, and old data shapes the code and
tests had to keep explaining. Done once, last, it is cheaper than carrying them for ever.

## What happens to databases

- **Development databases** from before the fold have a higher `user_version` than this build knows, so the app
  refuses to start on them with "created by a newer version of this app". Delete the file (and its `-wal` and `-shm`
  files) and restart; the schema is created again. Nothing is migrated.
- **Production** is wiped and recreated by the owner, not by an agent: [deploy.md](../../deploy.md#the-one-time-wipe-before-the-first-invitations).
  Take a backup first, wipe, deploy, check.

## How it is held to the old chain

`apps/api/src/db/__fixtures__/schema-before-collapse.json` is the schema (tables, indexes, triggers) the old chain
produced, taken from `sqlite_master` before the fold. `database.test.ts` checks that a fresh database matches it,
ignoring whitespace. The tests that exercised the individual removed steps (what each did to rows that existed
before it) went with them.

## Alternatives

Keeping the history: no one's data depends on it. Hand-writing a tidier schema: more chance of a difference; the
snapshot test would catch one, but the point was to change nothing.
