# Decisions and rationale

Short records of non-obvious choices, so they don't get re-litigated or forgotten. Add new ones at the bottom:
**Decision → Why → Consequences/alternatives.**

## Client/server rather than a browser-only app

Why: access from several devices; secrets (LLM/search keys) can't live in a browser; background jobs (idea scans);
CORS blocks fetching most web sources from the client. Alternative considered: Nuxt full-stack (rejected for a
cleaner provider boundary and easier testing).

## TypeScript monorepo; Hono + SQLite (`node:sqlite`); Vue 3 + Tiptap + Tailwind

Hono for end-to-end types and portability; `node:sqlite` to avoid native build dependencies, behind store classes
so Postgres/Drizzle can replace it; Vue because the owner knows it; Tiptap because a writing tool lives or dies by
its editor; Tailwind + headless primitives (not Bulma) for accessible, distinctive UI.
TypeScript is pinned to 5.9 because `typescript-eslint` doesn't support 7 yet.

## Ports and adapters for every external service

Why: the owner wants to swap and combine services freely. Ports live in `packages/core`; each has a fake and a
shared contract suite. Dependencies are injected into `createApp`.

## Users bring their own LLM key; no server-wide key

Why: the service shouldn't carry users' LLM costs. OpenAI offers "Sign in with ChatGPT" (partner-led); Anthropic's
terms (Feb 2026) disallow subscription OAuth in third-party apps and point to API keys, so API keys are the common
baseline. Keys are AES-256-GCM encrypted, bound to the user id, write-only in the UI. Losing `KEY_ENCRYPTION_SECRET`
loses all stored keys. In a shared profile, each request spends the requester's own key.

## Sessions: opaque cookie, hashed in the database

`HttpOnly`, `SameSite=Lax`, 30 days; only the SHA-256 is stored; revoked on password change/deletion. Writes are also
checked against `Origin`. Chosen over JWTs so sessions can be revoked.

## Passwords: scrypt from `node:crypto`

No native dependency. Format `scrypt$N$r$p$salt$hash` lets cost be raised later without invalidating old hashes.

## Account linking and unverified emails

Local accounts start unconfirmed (T2 added confirmation links). If Google later proves control of the same address,
the unverified local account's password and sessions are **discarded** and the identity is linked, which closes the
"pre-register someone else's email" takeover. Never link on an unverified provider email.

## Account deletion semantics

Removes the user and everything only they own (including profiles where they're the sole member). In shared profiles
they're removed; if they were the owner, the longest-standing member becomes owner; drafts they wrote there remain.
Immediate, no grace period or export yet (see T11).

## Sharing is by emailed invitation, addressed to an email rather than an account

People join a profile only by accepting an invitation, so nobody can be added unilaterally and inviting someone
who hasn't signed up yet just works. The owner's response is always the same `202`, whether the address has an
account, is unknown, or is already a member, so the endpoint can't be used to look people up (this replaced the
old "No account with that email" answer). Links are 7-day, hashed at rest, and bound to the invited address: the
signed-in account's email must match, so a forwarded link is useless to anyone else. Accepting from the link also
confirms the address, because the token only ever reached that inbox. Owners must have a confirmed address, and
are capped at 20 invitations a day, because each one makes our mail server email a stranger. After a Google
sign-in, a validated same-site `next` path returns people to their invitation (open redirects are rejected).

## Declining and blocking invitations: silent for the sender, keyed by address

An invitee can decline from the emailed link and optionally block that sender or everyone. Nothing about it is
visible to the inviter: the invitation vanishes from the pending list, and a later invitation to a blocking
address gets the same `202` as any other, with no email sent. Telling the sender would turn the endpoint into a
way to find out who has blocked you, or who has an account. Blocks are stored against the email address, not an
account, because invitees often have none; a null sender means everyone. The decline page acts on a button, not
on load, so a mail scanner opening the link can't withdraw an invitation or set a block. Managing blocks from the
account needs a confirmed address, otherwise anyone could register someone else's address and lift their blocks.
Blocks move with the person on an email change (and back on undo), but are deliberately left alone when an
account is deleted or cleaned up as unconfirmed: they protect the address, and removing them would let the spam
resume. Blocks about a sender go with the sender's account (cascade). Separately, any one address gets at most 5
invitations a day from everyone together (in-memory, like the other limiters); extras are dropped silently, for
the same no-enumeration reason, which means an owner may not notice that their invitation didn't go out.

## Tests must fail on browser errors

The first version of the e2e suite passed while the dev server was broken, because nothing watched the console.
`apps/web/e2e/fixtures.ts` now fails any test on uncaught exceptions, `console.error`, failed requests or 5xx.
The e2e API also runs on a real SQLite file so migrations are exercised.

## Profiles are venues, and ids are `<handle>-<slug>`

The existing profile (a container with members and drafts) _is_ the publishing venue the owner described, so it
was extended rather than adding a second concept. Profile URLs get shared, so ids are readable: users get a
`handle`, and a profile's id is `<creator's handle>-<slug of name>`. **Handles contain no `-`**, which makes the
split unambiguous: otherwise handle `jen` + profile `it-substack` and handle `jenit` + profile `substack` would
both be `jenit-substack`. The id follows the name: renaming a profile gives it a new id, and the old id stays in
`profile_aliases` forever. The API answers the old id with a 301 (308 for writes, which keeps the method and body)
to the new one, but only for members, so a stranger gets the same 404 as for an unknown id and can't learn that a
profile was renamed. Retired ids are never reused for another profile (a new "Blog" gets `-2`), but renaming back to
an earlier name reclaims its id. The web app moves the address bar when it meets an id that isn't in the person's
list (`useProfileAddressRedirect`). The id belongs to the creator's handle even if ownership later moves (T11). Handles are chosen at sign-up (checked live for availability); only sign-ups through an identity provider
get a generated one. Changing one later is T18; the migration also rewrote old UUID ids to this form. Alternatives rejected: per-user
uniqueness on the name alone (URLs would need the user in the path anyway), and globally unique names (squatting,
and the `substack` clash the owner wanted to avoid).

## Profile pictures live in SQLite, are raster-only, and are sniffed

A picture is up to 1 MB, in its own table (so listing profiles never reads image bytes), served by an authenticated
route with `nosniff`. The type comes from the file's leading bytes, not the declared Content-Type, and SVG is not
accepted (script, same origin). No object-storage port yet: nothing else needs one, and moving it behind a port is
easy when it does (hosting is D3). The per-user cap on owned profiles (25) bounds storage.

## Validation errors answer `{ error: "message" }`

The `zValidator` default returns a raw zod object, which the UI showed as "[object Object]" (found by an e2e test;
the component tests mocked the server and missed it). `validateJson` (`apps/api/src/validate.ts`) returns the first
problem as a plain message. Only the profile routes use it so far; the rest is T17.

## Email: provider-neutral SMTP; sent after responding; zero-setup default

`SmtpMailer` (nodemailer) works with any provider, so choosing Resend/Postmark/SES is configuration, not code.
`MAIL_TRANSPORT=console` is the default so local development needs no provider; `file` lets e2e tests read the
"inbox"; production refuses anything but `smtp`. Reset emails are sent in the background: awaiting the mail server
would make "this address has an account" observable through response time or a 500 when mail is down. The cost is
that a delivery failure isn't visible to the user, so it is logged (user id + SMTP error code, never the link) and
the SMTP connection is verified at startup.

## Email confirmation: gate sharing, not writing

Unconfirmed accounts can write and use AI features (nothing is exposed to anyone else), but can't invite others:
sharing is the one place an unproven address could leak someone's work. Links are bound to the address they
were sent to, hashed at rest, expire after 24 hours, and only the newest works. Using a link twice succeeds, because
mail scanners and double clicks routinely open links first. Resend is limited to 3/hour per user. Chosen over
blocking sign-in until confirmed because that makes a typo'd address a dead end and turns every mail outage into
a lockout.

## Changing and adding passwords while signed in

Changing needs the current password (guesses are throttled) because a stolen session shouldn't be enough to take
over the account; it signs out all other devices, cancels outstanding reset links, and emails a notice (no
action-token in it, only a link to the normal reset page). Adding a first password to a Google-only account goes
through an emailed link rather than a form: there's no current password to check, and email-link proof of the
inbox is stronger than trusting the session. The cost is that finishing it signs the person out everywhere, which
we accept and tell them about.

## Changing the email address: prove the new inbox, check the password, retire the old address's links

The change is a request plus a link to the _new_ address; the account keeps its old address until the link is
opened, so a typo is harmless. The password is re-checked when asking (a stolen session shouldn't be able to
redirect the account's email), the pending address is stored with the token so a link can only ever switch to the
address it was sent to, and only the newest request works. A password change or reset cancels a pending request:
otherwise a thief who started one could still finish it after the owner took the account back. On success the
new address counts as verified, and everything that was addressed to the old one is dropped: confirmation and
reset links, and invitations other people sent to it (invitations are matched on address, so they'd be
unusable anyway). The old address gets a notice with a "this wasn't me" link (7 days; the owner can recover the account even if the password is known to someone else). The link opens a page with a button rather than acting on load, because it signs everyone out and a mail scanner opening links must not trigger it; it works only while the account still has the address the change moved it to, restores the old address as verified (they opened mail there), signs out all devices and emails a reset link, since the intruder knew the password. Accounts with no password
(Google-only) can't change it yet: with only a session as proof there is nothing to stop a hijacked session
redirecting the email, so they add a password first (which already needs an emailed link). "Address already in
use" is revealed, as at registration, because the person has to be told; it is behind sign-in and throttled.

## Abandoned unconfirmed accounts are deleted after 14 days of no use

A typo'd or abandoned signup otherwise squats on an address forever (the real owner then can't register).
"Unused" means no drafts, no saved API key and no other people in their profiles, so nobody who has started
using the product loses work; the 14 days is configurable and 0 disables it. It runs as a simple in-process
interval (every 6 hours, 10 s after start, never overlapping, errors logged and retried), not a job queue,
because it's idempotent and cheap, and running on several instances at once is harmless. Deletion uses the same
code as "delete my account" (`removeUserAndOwnedData`) so the two can't drift. No reminder email is sent before
deletion (see T3e); the signup email states the rule up front.

## Every draft belongs to an idea

An idea is a name, notes, links to related work and its drafts. Drafts first gained a nullable `idea_id` and the
ones that already existed stayed standalone (T20); T20c then finished the job: a migration wraps each leftover
draft in an idea of its own, named after the draft (or "Untitled idea") and dated like it, so nothing is lost and
people can regroup them later. Drafts can only be created through an idea (`POST /ideas/:id/drafts`); the
standalone create and list routes are gone, and the profile page lists ideas. `drafts.idea_id` is still nullable
in the schema because SQLite can't add NOT NULL afterwards; the store always sets it and the API schema requires
it. An idea's drafts are listed with it, oldest first, which is also the reading order for a linked set of posts
(reordering is T20e). Deleting an idea deletes its drafts, which the page says before it asks for confirmation.
Links are plain web addresses (http/https only, with `https://` assumed when someone types `example.org`); the
field is a text input, because `type="url"` makes the browser refuse that. Having an idea counts as "using" an
account, so the unconfirmed-account cleanup never deletes someone's ideas. Renaming a profile rewrites its id in
every table that points at it; `ideas` was missing from that list at first, which broke renaming any profile
that had one, so the rename test now creates an idea.

## Idea sources: an ordered list of feeds, edited by any member

Idea generation will scan RSS feeds, so each profile holds a list of feed URLs (D2: RSS first). Order is the
priority later used to rank posts, so it is stored as a dense `position` and changed by sending the whole list of
ids (`PUT .../sources/order`) rather than "move X to N": the server refuses (409) unless the ids are exactly the
profile's current sources, so a stale screen can't drop or resurrect a feed, and drag, buttons and two editors
all use the one operation. The UI offers drag and drop (HTML5, grip handle, whole-row drag image, a line shows
where it will land) and, as the keyboard and touch route, up/down buttons; native drag and drop does not work on
most touch screens, and a library for it wasn't worth a dependency. Like drafts, the list is shared working
material, so **any member** can change it, not just the owner. Addresses are normalised (https assumed, fragment
dropped) so the same feed can't be listed twice.

## Feeds are read through a port, with the address checked at connection time

When a source is added the server reads the feed (`FeedFetcher` in `@lfwa/core`; fake and shared contract tests
as for other adapters) to refuse things that aren't feeds and to keep the title, description, website and a
picture. The address is typed by a user, so the fetch is an SSRF risk: `HttpFeedFetcher` uses `node:http(s)` with its
own DNS `lookup` that refuses loopback, private, link-local (cloud metadata), carrier-grade NAT, multicast and
mapped/NAT64 IPv6 ranges, so the check applies to the address actually connected to (checking the name first and
connecting later is open to DNS rebinding). Numeric addresses are checked directly, redirects are followed by
hand (max 5) so every hop is checked, only http(s) is allowed, time is capped at 10 s and size at 3 MB, and
`Accept-Encoding: identity` keeps the size we count equal to the size we hold. The XML parser (`fast-xml-parser`,
the one new dependency: parsing XML by hand is a worse risk) has entity expansion limits. If a pasted address is a
web page that advertises a feed (`<link rel="alternate" type="application/rss+xml">`) that feed is used, one hop only.
Adding is throttled (30/hour/person) because each add makes outbound requests.

Pictures: the feed's own logo, else the site's `apple-touch-icon`/`icon`, else `/favicon.ico`. They are fetched
once, sniffed by their bytes (PNG, JPEG, GIF, WebP, ICO; never SVG, 256 KB max) and stored in the database, then
served from our own origin like profile pictures. Pointing browsers at the other site's image directly would tell
that site who is looking at the list and when. Failure to get a picture never blocks adding: a lettered tile
stands in. Feed details are read only at the time of adding, so they can go stale and sources added before this
existed have none (they show their address); refreshing is a follow-up (T19c).

## Related-work links: fetched titles, and why fetching user-supplied addresses is locked down

Links are added by address alone; the server fetches the page and keeps its `<title>` (or `og:title`) as the link's
title, shown instead of the address. A title that is wrong or missing can be edited, and clearing it fetches again.
A link is refused if the text isn't a plausible web address (`new URL("https://rubbish")` is valid, so we also
require a dot, a real-looking ending, and no embedded password), if the site's name doesn't resolve, or if the same
page is already in the idea (compared ignoring `http`/`https`, `www.`, a trailing slash and the fragment). We only
reject on a definite "no such site"; a page that is slow, blocks robots or has no title is kept, because refusing
those would make links to paywalled or bot-hostile sites impossible.

Fetching an address someone typed makes our server contact whatever they name, so it is an SSRF risk (aiming it at
`http://169.254.169.254/` or an internal service). `HttpPageInfoFetcher` therefore: contacts only public addresses,
checked when the connection is made (so a name can't be re-pointed inward after the check) and for numeric
addresses before it; follows redirects by hand, vetting each hop; only uses ports 80/443 and http(s); has a 5 s
overall deadline and reads at most 256 KB, stopping at the end of the head; sends no cookies or credentials and asks
for uncompressed HTML so the cap is real; and treats the title strictly as text (Vue escapes it; entities are decoded
but nothing is rendered as HTML). Each person may trigger 30 lookups a minute. It sits behind a port with a fake and a
contract suite like our other external services; `PAGE_FETCHER=fake` is refused in production. The lookup happens
inside the request that adds the link (up to the 5 s deadline) rather than in the background, so the person sees
the title, or the reason it was refused, straight away. Not done: a per-site politeness delay or caching, and
the profile's own website field still accepts `https://rubbish` (it uses the older, looser `SiteUrlSchema`).
