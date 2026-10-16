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
loses all stored keys. In a shared publication, each request spends the requester's own key.

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

Removes the user and everything only they own (including publications where they're the sole member). In shared publications
they're removed; drafts they wrote there remain. A person who is the **only owner** of a publication others belong to is
refused (409) until they make someone else an owner or delete the publication (#166), so nobody is handed a publication they
didn't agree to run. The cleanup of never-confirmed accounts still passes ownership on to the longest-standing member:
there is no one to ask, and those accounts are unused. Immediate, no grace period; the account page offers a download of the person's writing first (#167, below).

**Several owners (#166).** A publication can have several owners but never none. Any owner can make a member an owner or
remove another owner (`PUT /api/publications/:id/members/:userId/role`, `{role}`), and an owner can step down if another
owner exists; the last owner can't be demoted, can't leave and can't delete their account while others are in the
publication. The count is checked inside the transaction that changes the role, so two owners removing each other at once
can't leave none. Draft editors are a separate thing and don't change with the role; nobody is emailed. The buttons ask
first, in a dialog that lists what the person will or won't be able to do (`lib/publication-roles.ts` holds that wording
once, for the invitation form to reuse in #168). We kept multiple owners rather than a single "transfer ownership" so
that handing over is two ordinary steps and never leaves a gap. Rejected: owners promoting with a switch (a role
change is a bigger step than a setting, so it gets a button and a dialog).

**Names stay if the person chooses (#153).** Deletion asks whether to keep the display name on what they contributed
to publications that continue (default yes) or show "a former member". On "keep", the name alone (never the email or
handle) is copied into `kept_name` columns on the rows that would lose their author (`idea_notes`, `idea_messages`,
`idea_research`, `draft_insertions`) just before the user row goes; reads use `COALESCE(users.name, kept_name)`, so
while the account exists the live name wins (renames still follow). On "don't keep" nothing is copied, so no row
holds the name (a test scans every table). Anything that later records an author (the #26 comments) must follow the
same rule: add its column to `UserStore.keepNameOnContributions`. Accounts purged as unconfirmed never keep a name.

## Sharing is by emailed invitation, addressed to an email rather than an account

People join a publication only by accepting an invitation, so nobody can be added unilaterally and inviting someone
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

## Publications, and their ids `<handle>-<slug>`

A publication is where a writer publishes (a Substack, a blog, a magazine, a newsletter). It started as a container with
members and drafts called a "profile", and was also called a "venue" in places; #174 settled on **publication** everywhere
(code, database, API, prompts and screens). The container _is_ the publishing place, so it was extended rather than adding
a second concept. Publication URLs get shared, so ids are readable: users get a
`handle`, and a publication's id is `<creator's handle>-<slug of name>`. **Handles contain no `-`**, which makes the
split unambiguous: otherwise handle `jen` + publication `it-substack` and handle `jenit` + publication `substack` would
both be `jenit-substack`. The id follows the name: renaming a publication gives it a new id, and the old id stays in
`publication_aliases` forever. The API answers the old id with a 301 (308 for writes, which keeps the method and body)
to the new one, but only for members, so a stranger gets the same 404 as for an unknown id and can't learn that a
publication was renamed. Retired ids are never reused for another publication (a new "Blog" gets `-2`), but renaming back to
an earlier name reclaims its id. The web app moves the address bar when it meets an id that isn't in the person's
list (`usePublicationAddressRedirect`). The id belongs to the creator's handle even if ownership later moves (T11). Handles are chosen at sign-up (checked live for availability); only sign-ups through an identity provider
get a generated one, and are asked once whether to keep it (`users.handle_chosen`). They can be changed later (T18,
below). Alternatives rejected: per-user
uniqueness on the name alone (URLs would need the user in the path anyway), and globally unique names (squatting,
and the `substack` clash the owner wanted to avoid).

## Publication pictures live in SQLite, are raster-only, and are sniffed

A picture is up to 1 MB, in its own table (so listing publications never reads image bytes), served by an authenticated
route with `nosniff`. The type comes from the file's leading bytes, not the declared Content-Type, and SVG is not
accepted (script, same origin). No object-storage port yet: nothing else needs one, and moving it behind a port is
easy when it does (hosting is D3). The per-user cap on owned publications (25) bounds storage.

## A publication's website icon is a guest, stored apart from the picture (#177)

When a publication has a website and no picture of its own, the website's icon stands in. It is fetched with the same
`FeedFetcher.fetchIcon` the reading list uses (SSRF-guarded; PNG, JPEG, GIF, WebP or ICO, never SVG, 256 KB), once
when the publication is created or its website changes, and stored in `publication_site_icons`, apart from the owner's
upload (1 MB, raster only, no ICO). Browsers get it from our own origin, so the other site never learns who looks.
It is drawn as any other site's image (`PublicationImage kind="source"`, on a plate, contained), never cropped into the
slot for the person's own picture; the owner's picture always wins, and removing it shows the icon again.

Best effort: the fetch has a 5 second limit and is throttled with the feed limiter. A failure, a timeout or a throttle
never stops the publication being saved; it just means no icon (and a changed website drops the old site's icon). It is
fetched inside the request, not afterwards, so the page the person lands on already has it.

## One publication description, not audience personas (#131, part of #27)

A publication has one Markdown description of the publication: what it is, who reads it and what kinds of writing go there. The
earlier plan (T16, #2) was a table of reader personas, but some writing has no audience (weeknotes to think in public,
#25), and a free-text description covers that case without a special state. It is Markdown so it can carry links;
it is rendered by the same safe renderer as the AI's messages (no raw HTML, only web and email links). It is up to
5000 characters, because it will go into prompts.

Everyone who works in the publication can edit it, so it has its own route (`PUT /api/publications/:id/description`, members)
instead of the owner-only `PATCH`. (It also once stored where the words came from and whether a person had accepted them, for AI drafts; those columns were
dropped in #151, see the last decision below.)

## The description is written in a rich-text editor, stored as Markdown (#147, part of #27)

People shouldn't need to know Markdown to describe their publication, so the description (describe page and publication settings) is written in
`DescriptionEditor`: a small Tiptap editor, using the packages the draft editor already has (no new dependency), with a toolbar
of **Bold, Italic, Bulleted list, Numbered list and Link**, and the usual shortcuts. It reads and writes **Markdown**, so the stored
format, the API, the AI context and the rendering on the publication page are unchanged.

- **Only what the description can show.** Headings, quotes, code, rules, strike-through and underline are switched off: underline would be
  saved as HTML, which the renderer escapes, and pasted headings or tables are flattened to paragraphs. The trailing empty paragraph Tiptap keeps
  is off too, so saved text doesn't end in blank lines and "select all, make a list" works.
- **Words from outside don't count as edits.** An AI draft or a saved description is loaded into the editor without being written back, so a
  description nobody has touched is saved exactly as it was. That matters: accepting an untouched draft is `…/description/confirm`, and any
  rewrite by the editor's own Markdown serialiser would have counted as an edit ("then edited by you").
- **Accessible by being ordinary.** The toolbar is five buttons with words on them (`aria-pressed` says what is on at the cursor), the text is
  a labelled `textbox`, and the link address is a small form that takes focus and gives it back, closes on Escape and refuses anything but
  web and email addresses ("example.com" means https://example.com). Over the 5000-character limit it says by how much, and saving waits.
- **Tests.** jsdom can't type into a rich-text editor, so `DescriptionEditor.test.ts` drives the real editor through its selection and the
  toolbar, and page tests swap in a plain-textarea stand-in (`src/testing/description-editor-stub.ts`); the e2e tests type in the real one.

## Prompts do not vary by an explicit publication mode (#137, #25)

Decided by the owner: **no "writing mode" on the publication** ("for readers" or "to think in public") choosing between
brainstorm and critique prompt variants, and no per-publication prompt editing. How the AI treats a publication comes from the
writer's own description of it (#131, #133): the prompts tell the model to read it, so a publication described as personal
thinking is coached rather than edited, and is not asked for an audience or a wider appeal.

- **Why.** A mode is one more thing to set and to get wrong, a publication is often both kinds of writing, and the free-text
  description already carries the distinction, in the writer's words and visible to everyone in the publication. One set of
  prompts is also one set to evaluate and keep within `docs/responsible-ai.md`.
- **What this settles.** #25's open question (prompts that vary by publication) is answered: they don't, beyond the
  description. Per-publication prompt customisation ("a house style for each publication", `docs/brainstorming.md`) is not planned.
  The distress-handling rules (principle 9) are not a publication mode either: they apply to every conversation.
- **If it stops being enough.** The boundary evals added in #133 (a personal publication is not asked for an audience, a publication with
  readers is weighed against them) are what to watch; if real use shows the description alone is unreliable, the fix is
  to improve those prompts and cases first, and a mode would need a new decision.

## The publication description is context for brainstorm, critique and research (#133, part of #27)

Every AI call that knows which publication it is for puts the publication description (#131) in a `<publication_description>` block:
in the brainstorm snapshot (where it replaced the placeholder for audience personas), at the top of the critique
message (before the draft, so block ids and anchors are unaffected), and in the research brief (after the idea).
Brainstorm's own prompt (`brainstorm-default.md`) and the three fixed prompts say what it is and how to use it.

- **Data, not instructions.** It is the writer's own text, so like their notes it is escaped (it cannot close the
  block) and every prompt says never to follow instructions found in it. Evals plant instructions in it for all three.
- **No block when there is nothing to tell.** A blank description is not sent (`usablePublicationDescription`; it once also
  left out an AI draft nobody had confirmed); requests are then byte-for-byte what they were before. The brainstorm snapshot
  still says "(not described yet)", which is what makes the coach ask who the readers are.
- **Adapt, not a mode.** Whether a publication is for readers or for writing to think in public (#25) is not a setting: the
  prompts tell the model to read the description, so a publication that says "personal, mostly for me" is not asked for an
  audience or a wider appeal, and critique then reads as a coach would. Whether that is enough, or the publication needs
  an explicit mode, was decision #137: it does not (see above); the evals added here are what to watch.
- **Shared by the publication.** The description belongs to the publication, so everyone in it sends the same block through
  their own key, model and (for brainstorm) prompt. People who saved their own brainstorm prompt keep it; the rules that
  are added after it carry the instructions about the description either way.

## An AI draft of the publication description: reflect, label, confirm (#135, part of #27)

> **Removed in #150** (see _Publication descriptions are written by the writer_, at the end of this file). Kept as the record of why it was built.

`POST /api/publications/:id/publication/description` (`{ urls, replace? }`, any member, with their own key) drafts the publication
description from 1 to 5 sample posts (#134). **Rung 2: it reflects** what the posts show and the writer then reads,
edits and confirms it; it never writes what will be published (`prompts/publication-description.md` forbids slogans,
taglines, bios, advice and writing for the publication). Nothing is spent until the button is pressed.

- **The server reads the posts itself** from the addresses, rather than being sent text: the evidence stored with the
  draft (`description_sources`) is then exactly what the model saw, and a client can't attach a claim to a link it
  didn't read. Posts that can't be read are dropped and reported (`skipped`); none readable is a 422 and no AI call.
- **Saved as a draft**: origin `inferred`, `description_confirmed = 0`, the addresses as sources. Until confirmed
  (`POST …/description/confirm`) it is shown to the writer but never sent to any model (#133: a test proves the
  brainstorm snapshot omits it, then includes it after confirming). Confirming keeps `inferred` and the sources, so the
  AI origin stays visible. (Changed in #136: a person's changes to a draft no longer make it "theirs"; see below.)
- **Not overwriting** someone's own words: a publication whose description was written by a person answers 409 unless
  `replace: true`. A draft over an earlier draft needs no confirmation.
- **Capped**: 5 drafts an hour per publication, on top of the shared per-person allowance for fetching posts, so the way
  to a better description is to edit it, not to re-roll. A reply that is empty or over 5000 characters is refused and
  nothing is saved.
- **What leaves the system**: the fetched text of the chosen posts (up to 8000 characters each), to the writer's own
  provider. **Boundary evals** (`evals/`): describes only what the posts show; says when evidence is thin; no
  demographic guesses about readers; says when posts differ; ignores instructions planted in a post.

## Describing a publication: an optional page, and the origin follows the words (#136, part of #27)

> **Removed in #150** (see _Publication descriptions are written by the writer_, at the end of this file). Kept as the record of why it was built.

The flow is its own page, `/p/:publicationId/describe` ("Describe this publication"). **The first thing on it is the box to write the
description in** (#146: the first version opened on a two-step flow that led with the post picker, which made drafting look like the
main path). Under the box is a **collapsed** section, "Draft from a few posts": the picker from #134 (the publication's recent posts
and/or pasted links, from this publication or similar ones), what is sent, and **Draft a description**. A draft fills the box, closes the
section and moves focus to the box, to read, change and use. A note says a draft replaces what is in the box when there is
something there. The page is reached from the new-publication form (**Create and describe it**), from the publication page's
invitation, and from the publication settings, so it can be done later.

- **Opt-in beside "Create publication", not a step in the way.** The first plan put it between creating and arriving. It
  is a second button instead: describing is optional, and a forced extra screen would have been the default for every
  publication (and for 25 existing tests). Making it the default later is a one-line change.
- **Plain words about what is sent** sit above the picker: the text of the chosen posts goes to the writer's own
  provider, with their own key, only when **Draft a description** is pressed. Visiting costs nothing.
- **Marked as the AI's, with evidence, until accepted.** `DescriptionOrigin` shows the "AI draft" mark (the highlighter,
  which is for exactly this), the posts it was drawn from, and what has happened to it: not accepted yet (the assistant
  does not see it), accepted as it was, or edited. It appears on the draft review, the publication page and the settings.
  **Use this description** on an untouched draft calls `…/description/confirm`; with changes it saves them.
- **Origin follows the text, so edits keep the mark.** A person's changes to an AI draft no longer turn it into "their
  own words" (the #131/#135 behaviour): the origin stays `inferred`, the sources stay, and `description_edited` becomes
  true. Saving counts as accepting it. Clearing the description starts again from nothing (entered, no sources, not
  edited), and a new draft resets "edited". A description written from scratch is never marked.
- **Leaving without accepting** keeps the draft, unused. The publication page invites the writer to read it and decide.

## Sample posts for describing a publication: found and read without AI, kept nowhere (#134, part of #27)

> **Removed in #150** (see _Publication descriptions are written by the writer_, at the end of this file). Kept as the record of why it was built.

To draft a publication description (#135, #136) the writer chooses 3 to 5 sample posts: ticked from the newest ten of the
publication's own feed, and/or pasted as links. Finding and reading them is a chore, not writing, so no LLM is involved
and the routes are `POST /api/publications/:id/publication/posts` (`{ siteUrl? }`, defaulting to the publication's website) and
`POST /api/publications/:id/publication/samples` (`{ urls }`, one to five), open to every member. Both are `POST` because they make
the server fetch other people's pages; neither saves anything, so a post's text exists only in the answer to the
request that read it.

- **The feed** is found with the existing `FeedFetcher` (`discover`, which puts feeds of comments last, then
  `readItems`); the first feed is used, because choosing between feeds is what #68 is for and a description needs
  only an idea of the publication. No feed, an unreachable site or an empty feed is not an error: the answer is
  `{ posts: [], notice }` with a sentence that ends "Paste links to a few of its posts instead", so the writer is never stuck.
- **The text** comes through a new `PageTextFetcher` port (title, plain text, `truncated`), with a fake and a contract
  suite. Its HTTP adapter shares everything that makes `HttpPageInfoFetcher` SSRF-safe by using one class,
  `SafeReader` (public addresses only, checked at connect time; hand-followed redirects; ports 80/443; no cookies;
  uncompressed so the cap is real), which `HttpPageInfoFetcher` now uses too, so the two can't drift apart. It
  differs in reading up to 1 MB (not just the head) with an 8 s deadline. Text is extracted without a parser
  dependency, in the same spirit as the title: the page's `<article>` (else `<main>`, else the body), without scripts,
  styles, menus, headers and footers, entities decoded, never markup, cut at a word at 8000 characters (`truncated`
  says so). A page whose words come from scripts gives "couldn't read", not an empty sample.
- **Each link answers on its own** (`ok` with title and text, or `ok: false` with what the person can do), so one
  dead link doesn't lose the others. More than five is refused (400), repeats are read once.
- **Throttle:** one allowance of 20 an hour per person covers both routes (each looks at a site and up to five pages).
- The text goes back to the browser rather than being kept server side, so #135 can either take the samples from
  the page or read the links again itself; choosing which is #135's. Whatever it does, the text is **data, never
  instructions** (fetched pages can say anything), as for the research prompts.

## Validation errors answer `{ error: "message" }`

The `zValidator` default returns a raw zod object, which the UI showed as "[object Object]" (found by an e2e test;
the component tests mocked the server and missed it). `validateJson` (`apps/api/src/validate.ts`) returns the first
problem as a plain message. Every route that reads a JSON body uses it (T17), so a schema's messages are what people
see: give each rule you add a message written for them.

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
"Unused" means no drafts, no saved API key and no other people in their publications, so nobody who has started
using the product loses work; the 14 days is configurable and 0 disables it. It runs as a simple in-process
interval (every 6 hours, 10 s after start, never overlapping, errors logged and retried), not a job queue,
because it's idempotent and cheap, and running on several instances at once is harmless. Deletion uses the same
code as "delete my account" (`removeUserAndOwnedData`) so the two can't drift. The signup email states the rule
up front, and (T3e) a single reminder goes out 3 days before deletion (or half the limit, if that is shorter),
so a late confirmer isn't surprised. It carries a fresh confirmation link, which is the one-click way to keep the
account. `users.deletion_reminded_at` records that it was sent; it is set before the mail is queued, so a delivery
failure (logged, like all background mail) means no reminder rather than a duplicate. Only accounts inside the
warning window are warned, so on first deploy, or after downtime, accounts already past the limit are deleted
without a warning, and the job deletes before it warns.

## Every draft belongs to an idea

An idea is a name, notes, links to related work and its drafts. Drafts first gained a nullable `idea_id` and the
ones that already existed stayed standalone (T20); T20c then finished the job: a migration wraps each leftover
draft in an idea of its own, named after the draft (or "Untitled idea") and dated like it, so nothing is lost and
people can regroup them later. Drafts can only be created through an idea (`POST /ideas/:id/drafts`); the
standalone create and list routes are gone, and the publication page lists ideas. `drafts.idea_id` is still nullable
in the schema because SQLite can't add NOT NULL afterwards; the store always sets it and the API schema requires
it. An idea's drafts are listed with it in an order the person sets, which is also the reading order for a linked
set of posts (T20e). New drafts go last; `drafts.position` holds the order and `PUT .../ideas/:id/drafts/order`
changes it the same way as idea sources (the complete list of ids, refused with a 409 unless it names exactly the
idea's drafts), and counts as a change to the idea. Deleting an idea deletes its drafts, which the page says before it asks for confirmation.
Links are plain web addresses (http/https only, with `https://` assumed when someone types `example.org`); the
field is a text input, because `type="url"` makes the browser refuse that. Having an idea counts as "using" an
account, so the unconfirmed-account cleanup never deletes someone's ideas. Renaming a publication rewrites its id in
every table that points at it; `ideas` was missing from that list at first, which broke renaming any publication
that had one, so the rename test now creates an idea.

## Notes are separate cards, with an origin (T28)

An idea's notes used to be one text column. They are now rows in `idea_notes` (text, origin, author, position,
`added_at`), arranged by the person and changed through `/ideas/:id/notes` (add, edit, delete, and reorder by
sending the whole list of ids, with a 409 if it is stale, as for feed sources; at most 200 per idea).
`origin` is `entered`, `brainstorm` or `reading`; notes made through the API are always `entered`, and later
tasks set the others on the server. `added_at` is for the drafting drawer (T33) and has no route yet.

- **`publication_id` always, `idea_id` nullable.** A note can later belong to a publication before it has an idea
  (starting an idea from notes, T37), so the table does not assume an idea. `publication_id` is in the publication-rename list.
- **No tags or reading-item column yet.** Migrations are append-only and `ALTER TABLE ADD COLUMN` is cheap, so
  T35 and T31 add theirs when they need them.
- **Existing text becomes one note.** The migration copies each non-blank `ideas.notes` into a single `entered`
  note. The old column is no longer read (SQLite can't cheaply drop a NOT NULL column); new ideas write `''`.
- **Transitional single text.** `Idea.notes` is still returned, and `PATCH /ideas/:id` / `POST /ideas` with
  `notes` still work, so the idea page and brainstorm are unchanged until T29 and T30. It is the notes as
  Markdown bullets (`notesToMarkdown`, T28b): one top-level bullet per note, the rest of a note's lines (and any
  bullets of its own) indented two spaces under it, so a line break inside a note can't be mistaken for a new
  note. Writing it back (`markdownToNotes`) splits text made only of such bullets into notes; any other text
  becomes one note. Text that reads as the notes already there changes nothing, so a form that always sends
  `notes` keeps each note's id and origin. Remove it with T29/T30.

## Notes on the idea page: cards or a list, one shared reorderable list (T29)

The idea page's single "Expand on your idea here" box is replaced by a **Notes** section that talks to the `/notes`
routes (the box on the _new idea_ page stays; what is typed there becomes the first note). Each note shows its
text, where it came from (added by hand, from brainstorming, from reading) and Edit / Delete; a box underneath adds
the next one. The idea's name form now saves only the name.

- **A list, not cards.** Notes were first offered as cards or a list, with a toggle (T29). The cards were removed
  (#59): dragging between cards two across didn't work in the owner's Chrome (it did in an automated run, so it
  was likely down to real pointer behaviour), and cards look uneven for notes of very different lengths. Notes are
  one `ReorderableList`, like the idea sources and an idea's drafts.
- **Deleting is immediate**, as for related-work links, with no confirmation or undo. Revisit if people lose notes.
- **Brainstorm is unchanged.** It still shows and proposes the notes as one Markdown text (T28b) until T30, so
  accepting a "replace the notes" suggestion still replaces them all with what the AI wrote.

## Brainstorm records notes as you chat; only titles and new ideas are proposals (T30)

The brainstorm's job is now to add notes. The model's `add_note` tool adds a note to the idea at once (origin
`brainstorm`, attributed to the person whose message led to it) instead of proposing it, because the owner wants the
points made in conversation captured as they are made, in a trusted space, and a note is easy to delete. Reasoning,
limits and the injection argument are in [brainstorming.md](brainstorming.md). Consequences:

- `update_idea` now only changes the title; its notes field, the notes diff and `DiffView` (and `lib/diff.ts`, used
  only by it) are gone. Old threads that hold a notes proposal still show it as text, but accepting it no longer
  applies the notes.
- A `create_idea` proposal's starting notes are Markdown bullets, split into notes with origin `brainstorm`.
- `idea_message_notes` records each `add_note` call's outcome (added, duplicate, full) so the chat reads the same
  after a note is deleted and the model can be told what became of each call.
- The duplicate check is exact apart from case, spacing and closing punctuation. Near-duplicates in different words
  still get through; the prompt asks the model not to repeat points, and the notes are in its snapshot.
- The default prompt still describes a commissioning editor (T41/#43 changes that to a coach); only its closing
  paragraph, about recording notes, changed here.

## Holding to confirm instead of a dialog (T39)

Deleting a note asks for a deliberate act without a dialog: **press and hold** the Delete button (about 0.9 s,
`HOLD_MS` in `HoldButton.vue`) while a ring fills around the pointer. Letting go early, moving off the button or
tabbing away cancels; finishing the hold deletes.

- **Every way in.** The mouse and a finger (the ring is drawn above a finger, which would hide it; the context
  menu and text selection are blocked on the button so a long press doesn't open them) and the keyboard (hold Enter
  or Space; the key's own click is suppressed so a quick press does nothing).
- **Assistive technology can't hold.** A click that no press or key led to (a screen reader's "activate") arms the
  button instead ("Press again to confirm", for 5 s); a second one confirms. The button's description tells
  people both ways, and a polite live region announces holding, confirming and cancelling.
- **Reduced motion.** With `prefers-reduced-motion` there is no ring; the label says "Keep holding…". The ring
  itself is a CSS animation of the hold's length, while the confirmation is decided by a timer, not by the
  animation, so they can't disagree.
- **Where.** Only deleting notes so far. Related-work links and other deletions are unchanged; anything that
  deletes work that can't be got back can adopt it (`<HoldButton @confirm=…>`), and the delete-an-idea and
  start-again dialogs stay as they are for now.

## Notes name their author (T42)

A note's origin line names the person (see "Who took a note is a chip" below). It is
a trusted space (the owner's call), and in a shared publication "added by hand" wouldn't say whose hand. `IdeaNote.authorName`
is joined from `users` when notes are read, so it is always the person's current name; it is null once their
account is gone (the note stays, `created_by` is set null) unless they chose to keep their name (see Account deletion semantics), and the label then says "a former member". For a note
the AI recorded, the author is the person whose message led to it. Notes written through the old single-text
route (`PATCH /ideas/:id` with `notes`, which no screen uses any more) have no author.

## The brainstorm is a writing coach, and the app owns when it stops (T43)

The default brainstorming prompt changed from a sceptical commissioning editor to a **writing coach** after the owner
found the editor too critical for working out what you think. The persona is the writer's to tune (it is their
editable prompt); what keeps the service honest is in the app-owned rules, which people can't remove. The rules now
also say when to stop: ask the one question that matters most and, once the writer can say what the idea claims, who
it is for and why it matters, say so and stop asking (so a prompt that tells the AI to keep going can't override it,
though like all prompt-level behaviour it is eval-tested, not guaranteed). The "keep asking questions that draw out more" line from T30 is gone, and the AI
asks for the writer's own title or angle before offering one. The AI in the chat is labelled **Coach**, not Editor. The
distress, persona-honesty and flattery rules from responsible-ai.md are only partly here (a one-line "you are an AI"
and "hold your position"); the full set, with evals, is still open work.

## Changing your display name

The name asked for at sign-up ("What should we call you?") is what other people see: on notes and brainstorm
messages, in a publication's list of people, and in invitations. It can be changed on the Account page
(`PUT /api/account/name`, validated by the same `NameSchema` as sign-up and publication names: trimmed, 1 to 100
characters). **Nothing keeps a copy**, so a change shows everywhere at once with no migration: note authors, thread
messages, members and a waiting invitation's sender are all read from `users.name` when shown, and tests prove it
for each. The old name is not kept anywhere on purpose. There are two copies that cannot follow a change: emails
already sent (they say the old name, and the form says so), and the in-memory "X is waiting for a reply" lock during
a brainstorm reply in flight, which lasts at most the reply timeout. Unlike a username it has no effect on any
address, so there is no list of retired names and no daily cap, only the light per-person throttle other account
changes share. Names are not unique, as before.

## An idea's links are its reading list, and can be marked read (T31)

What the idea page called "Related work" is now the idea's **Reading list**, and the publication's RSS feeds are
**Reading list sources**: the two are still separate tables and routes (an idea's items are links someone chose; the
publication's sources are feeds that will later fill a publication-level list, T37). The code keeps its old names (`idea_links`, `IdeaLink`, `PublicationSources`): renaming them is churn for no gain.

- **Read is the writer's say-so.** Each item has `read_at` (null until marked), set by a plain checkbox, because the
  app can't know that a page was read, and people read things offline. Marking read twice keeps the first date;
  unticking clears it. The checkbox is the whole mechanism; the friction before citing an unread item is T34.
- **Origin.** Each item records `origin`: `entered` (the writer, and everything so far), `brainstorm`, `research` or
  `idea_generation`, so items an AI suggested are visibly marked ("Suggested in brainstorming", "Found by
  research"), per [responsible-ai.md](responsible-ai.md) principle 5. `entered` came first; T38 now produces
  `brainstorm` (a page the writer gave the coach) and `research`, and T37 will produce `idea_generation`. The database refuses any other value.
- **Notes from reading.** `POST …/notes` takes an optional `readingItemId` (it must be on the same idea). Such a
  note has origin `reading` and says which item it came from ("From reading “Title”", and Ada as a chip). Removing the item
  keeps the note, and its origin, but not the link to the item. The screen for taking notes while reading is T32.
- **Not changed:** what the brainstorm AI is told. Its snapshot still says "Related links the writer has saved", and
  doesn't mention what is read; changing that would be a prompt change for the owner to review.

## Notes beside the draft, and the words keep their origin (T33)

While drafting, the idea's notes are listed beside the editor (a slide-over drawer on a phone). **Add to draft** puts
a note's words in the draft **after the paragraph the cursor is in** (at the end if the cursor was never in the text),
as its own paragraph(s), followed by a link to the reading-list item if the note came from one. The draft is
**saved first**, and only then is the note marked added (`added_at`) and hidden from the list, so a note never
vanishes unless its words are safely in the draft. "Show notes already added" lists them again, and **Put back**
clears `added_at` (it does not take the words out of the draft). A note is "added" once, for the whole idea, not per
draft: a note goes into one piece, and putting it back is how it goes into another.

- **Provenance ([responsible-ai.md](responsible-ai.md), principle 5).** Each insertion is a row in
  `draft_insertions` with exactly what was inserted, the note's **origin** (taken from the note by the server, never
  from the request), who wrote the note, who inserted it, and the reading-list item as it was then. It outlives the
  note, the item and the people (their names go null; the text and origin stay) and goes with the draft. The draft
  shows "Where some of the words came from" and, for each, **whether it is still as inserted**.
- **What "edited" means.** The record is not stored in the prose (that would mean marks inside the Markdown or a
  custom editor node). The page checks live whether the inserted words can still be found in the draft, ignoring
  case, spacing and Markdown punctuation, and says "Still as inserted" or "Edited or removed since". So an edit is
  never silently relabelled as the writer's own, but a light rewrite and a deletion look the same.
- **Layout.** The drafting page opts into a wider container (`meta.wide`); at 1024px and up the notes are a sticky
  column. Below that a **Notes** button slides the drawer in over the page, with a backdrop, a Close button and
  Escape; while shut it is invisible, so it is out of the tab order. Tried at 390px (screenshots): it reads well. Known
  limits: there is no focus trap (the page behind can still be reached by tabbing, though not by clicking), and the
  draft's own Save and Critique sit under the backdrop while it is open. Revisit if it feels fiddly in use.
- **Found on the way:** the drafting page had no level-one heading (the title is a field), which the first axe check
  of that page caught; it now has a visually hidden one.

## Reading an item: the page opens in its own tab, the notes stay here (T32, decision D4)

Each reading-list item has a **Take notes** page. It shows the item, an **Open the page** link (`target="_blank"`,
`rel="noopener noreferrer"`), a "I have read this" checkbox (the same say-so as on the idea page), the notes already
taken from this item, and a box to add another. A note added here is sent with `readingItemId`, so it has origin
`reading`, names the item in its origin line ("From reading “Title”", and Ada as a chip) and appears among the idea's notes too.

- **D4 option 1, not a reader view or an iframe.** Most sites forbid being framed (`X-Frame-Options` /
  `frame-ancestors`) and we can't override that, and a reader view means a new dependency, sanitising untrusted HTML
  and copyright care. Opening the page in a tab works for every site, including paywalled ones the writer can already
  read, and puts no third-party content on our origin. A reader view can come later behind the same page.
- **Side by side is the writer's to arrange.** A web page cannot ask the browser for a split view: Chrome's Split View
  API (`tabs.create({ splitWithTabId })`, Chrome 155) is for browser extensions only, and the other browsers' split
  views (Edge, Vivaldi, Firefox's experimental one, Zen) are, as far as we found, controlled only by the person. So the page only says, in plain words,
  that the two tabs are best put side by side. A browser extension would be the way to automate it; that is the
  "extension" option in D4 and not worth building for this.
- **Quote or own words:** the writer says which (see the next section).
- **The box for a new note is above the notes taken so far** (#57), so it stays in the same place as the list
  grows instead of being pushed off the screen. For the same reason the page lists its notes **newest first**, so a
  note just added shows up right under the box (the idea page keeps the writer's own order).
- **The title and authors can be edited on the reading page** (an "Edit title and authors" button by the heading),
  because the lookup often finds none and the page is then called by its address. It is the idea page's edit with the
  address left alone; a blank title asks the server to look the page up again (see "Who wrote a reading-list item").
- **Taking a note from an item marks it read, and read items go last** (#80). The server marks the item read when a
  note is added with its `readingItemId` (the first read date is kept), because a note taken from a piece means it was
  read, and the writer can still untick it. The reading list is ordered by the server, unread first, read last, each in
  the order added, so every screen that lists it agrees and an item drops to the bottom the moment it is ticked.
- **Pasting ticks "This is a direct quote"** (#76). Words pasted into an empty note box, or over all of what is in it,
  are almost always someone else's, and a quotation stored as the writer's own words is the mistake this page must
  not make easily. So the box is ticked and the page says why ("Ticked because you pasted this. Untick it if these are
  your own words"). Typing never ticks it, nor does a paste into the middle of the writer's own words, and a writer
  who unticks it is not overruled. It is a default the writer can see and undo, not a rule.
- **Other pages found while reading** (#56) are added from the same page: a web-address box (the idea page's checks
  and title lookup, same call) puts the page on the reading list as `entered`, the page stays open, and a link offers
  to read the new item next. Nothing is read or noted for the writer.
- **Publication level.** Only an idea has a reading list so far (the publication's feeds are sources, not items), so this page
  is for an idea's items. A publication-level list (T37) would reuse the page.

## Flat tags on notes (T35)

A note can carry **tags**: short labels (up to 40 characters, up to 10 on a note) the writer chooses, such as the
draft or section a note belongs to, or a theme. They are **flat**: there is no hierarchy, and a "section of a
draft" is just a tag you use consistently. They are stored in `idea_note_tags` (one row per note and tag, in the
order given, a tag unique per note ignoring case) and go with the note.

- **Set as a whole.** `PUT /ideas/:id/notes/:note/tags {tags}` replaces the note's tags, the way notes are put in
  order. The server tidies spacing and drops repeats ignoring case (keeping the first spelling), so "Intro" and
  "intro" are one tag; empty or over-long tags are refused with a message. Editing a note's tags is part of editing
  the note (a comma-separated field, with the tags already used on the idea offered as buttons); only what changed
  is sent.
- **Filter, not a view.** A row of buttons (All, then each tag) narrows the notes list, and the drafting drawer,
  to the notes with that tag. It appears only once some note has a tag. In the drawer it offers only tags on notes
  that can still be added. If the last note with the filtered tag loses it (or is added to the draft), the filter
  quietly goes back to All.
- **Putting notes in order while filtered** still works: the notes that are hidden keep their places and the
  visible ones take the places the visible ones had, so the server still gets the complete order it requires.
- **Not tags:** the AI's snapshot doesn't include them, and brainstorm doesn't tag notes (it can't edit notes).

## A direct quotation is a note that can't be edited and goes into a draft as a blockquote (T32b)

On the reading page, ticking **This is a direct quote** makes the note a quotation (`is_quote`, `quote` in the API).
Unticked, it is the writer's own words about the page, as before. Why it matters: a quotation pasted into a draft as
plain text is indistinguishable from the writer's own prose ([responsible-ai.md](responsible-ai.md), principle 5), and
a quotation that has been "improved" is no longer a quotation.

- **Needs a source.** `POST …/notes` with `quote: true` also needs `readingItemId` (400 otherwise): a quotation is
  someone else's words, so it says whose. The note says "Quoted from “Title”" (Ada as a chip) and is set apart as a
  blockquote wherever it is shown.
- **Uneditable, in three places.** The notes list has no Edit button for it; `PATCH …/notes/:id` answers 409 ("Delete
  it and add it again if it needs correcting"); and a database trigger aborts any `UPDATE` of a quotation's text, so a
  later feature (merging notes, say) can't alter one by accident. It can still be tagged, put in order, set aside
  and deleted. The idea's notes-as-one-text view (`PATCH /ideas/:id` with `notes`) rewrites every note, so it is
  refused (409) when that would change anything while the idea has a quotation; sending the same text back is fine.
- **Into a draft as a blockquote.** The text goes in with `> ` on every line and, if the item still exists, a last line
  inside the quote, `> — [Title](url)`. The server checks it: a quotation's insertion is refused (400) unless every
  non-blank line starts with `>`, so a quotation can't be recorded as pasted unquoted. Once it is in the draft it is
  the writer's draft to edit; the provenance record still says whether it is "Still as inserted".
- **Not done:** merging or splitting notes does not exist yet; when it does, a quotation must not be merged into
  other text or split (the trigger will enforce it, but the interface should say why). No migration is needed for
  existing notes: they are all `quote = 0`.

## Linking to something you haven't read asks first (T34)

The drafting drawer has a **Reading list** section: each item with whether it is read, and an **Insert link** button
that puts a link to it in the line being written (inline, not a new paragraph) and saves the draft. If the item
isn't marked read, the writer is asked first, in a modal dialog with three ways out: **Cancel** (focused, so a stray
Enter does nothing; inserts nothing), **Read it now** and **Mark as read**.

- **Notes from reading don't ask.** Adding a note taken from an item (its words come with a link to the item) does
  not ask whether the item is read, even if it isn't ticked: the note was taken on the item's own page, which is
  the reading. Asking would be nagging. Only putting a bare link in from the Reading list asks.
- **Read it now opens a new tab**, on the item's reading page (T32), and inserts nothing. The writer's draft is
  untouched, so nothing can be lost by leaving; a line in the drawer says where to pick up. Once they have read it
  (and taken notes, which marks it read) they come back and add it again. Navigating away in the same tab was
  rejected: it would mean saving a half-written draft just to ask a question.
- **Mark as read is the writer's say-so**, as for the tick on the idea page: they may have read it offline. It marks
  the item read (visible on the idea page) and then inserts.
- **It is friction, not enforcement.** A link typed or pasted straight into the draft isn't checked, and the app
  can't know whether anyone read anything. The aim is the moment of choice, in line with the owner's wish for
  "friction around users referencing sources in their draft that they haven't actually read" (#24). Revisit
  when the research assistant (#12) can suggest sources, where an unread AI-suggested item is the case that matters.
- **`ConfirmDialog` grew two options** (`alternateLabel`, `confirmTone`) rather than a second dialog component.

## Merging and splitting notes (T36)

**Merge.** "Merge notes" on the notes list lets the writer tick two or more notes and join them into one: the
first of them (in the order they are arranged, whatever order they were ticked in) takes the joined text, as
paragraphs, and its place; the others are deleted. The result is a new, unused note (`added_at` cleared). Because a
note says where it came from, and the notes now have rules about that, only some notes can be merged
(`NoteEditService`), each refusal a 409 with a message saying why:

- **Same origin.** Typed, brainstormed and read notes can't be mixed. A merged note can say where it came from only
  once, and picking one origin would either launder an AI-recorded or quoted point as the writer's own typing or
  claim a source for words that didn't come from it ([responsible-ai.md](responsible-ai.md), principle 5). The
  writer who wants them together can retype the point as one note. Alternatives rejected: a "mixed" origin (needs
  a table rebuild and a new label everywhere) and silently taking the first note's origin.
- **Same reading-list item** if they were taken from one.
- **No quotations** (they have to stay exactly as written) **and nothing already in a draft** (its words are in
  the draft; "put it back first").
- The author is the notes' author if they all share one, otherwise whoever merged them. Tags are every tag once
  (ignoring case), first come first kept, at most the 10 a note can hold (a tenth-and-over tag is dropped, which
  is rare). The merged text can't exceed a note's limit.

**Split.** While editing a note, **Split here** cuts it where the cursor is. The first part stays the note (same
place, identity and tags); a copy with the second part follows it, with the same origin, author, source and tags. The
two parts are sent as the writer sees them (it is their own edit of an editable note), so unsaved changes are kept;
both need words. Quotations and notes already in a draft can't be split, and splitting needs room under the 200-note
limit.

Both answer with all the idea's notes (the way reordering does), and neither is undoable: a merge deletes the
other notes. Merged-away notes held nothing in a draft (those can't be merged), so nothing else points at them.

## Who took a note is a chip, not "by Name" (#62)

"Quoted while reading “Title”, by Jeni" read as if Jeni had written the piece. A note's origin line is now what it is
("Added", "From brainstorming", "From reading “Title”", "Quoted from “Title”") followed by the person who recorded it as
a **name chip**: a rounded pill like a tag but blue, so it can't be mistaken for one, with a neutral "A former member"
chip once their account is gone. Screen readers hear ", recorded by Ada". The same component is used on the idea's
Notes, the reading page, the notes beside the draft and the draft's record of where words came from. "By" is kept for
the author of a piece (#63). Users have no pictures yet (only publications do), so the chip is their name; a picture can go
inside it when accounts get one.

## Who wrote a reading-list item (#63)

A reading-list item has `authors`: a list of names (stored as JSON in `idea_links.authors`, at most 10, 100 characters
each). They are what the page says, found with the title, and the writer can correct them on the reading page.

- **Detection.** `PageInfo` has an optional `authors`; it is absent when the page names no one, so the port's other
  results are unchanged. The HTTP adapter now reads to the end of the `<head>` (it used to stop at `</title>`, before
  the meta tags) and takes the first of these that names anyone: `<meta>` `author`, `article:author` (only when it
  holds a name: it is often a publication address, which is skipped), `dc.creator`, `citation_author`, then schema.org
  JSON-LD `author`. The first source that names anyone wins, so a page isn't credited twice. Text only: names are
  decoded, tidied, de-duplicated and capped, and never treated as HTML. The fake names two authors for any address
  containing `authored`; the shared contract suite covers it.
- **The writer wins.** Authors given are kept as given. Omitted, they are left alone, unless the page is looked up
  again (blank title, or a changed address): a changed address takes the new page's authors (the old page's don't
  follow the item), and a re-lookup with an empty list asks for them to be detected again. So one form can say "look
  both up again" (blank title, blank authors), and a lookup never overwrites names the writer entered. A title given
  when adding means no lookup, so no authors are found.
- **One field, commas.** Names are typed separated by commas. A name written "Last, First" would be split in two;
  that is the cost of one plain field, and it can be revisited if people ask.
- **"By" means the piece's author.** A note's origin line reads "Quoted from “Title”, by Ada Author and Bo Writer"; the
  person who took the note is the chip (#62). The draft's record of where words came from keeps the authors **as they
  were when the words went in** (`draft_insertions.source_authors`), like the title.
- Items saved before this have no authors (`'[]'`), and an unreadable stored value reads as none rather than breaking
  the page.

## Research is its own tool, and the AI adds to the reading list only what a person ticks (T38)

The research assistant's job is to put things on the reading list, not to write notes (this replaces the
reading-list part of T7). **Assistance-ladder rung:** none of 3–5. It points at pages for the writer to read and
originates no text they could publish; the closest rungs are 1–2. Evidence is one of the things
[responsible-ai.md](responsible-ai.md) says to protect, so the writer chooses the areas to look into (they write
them first), the AI only suggests, and a person decides on every page. The design was settled with the owner after
a first version built research into the brainstorm conversation was set aside.

- **Separate from brainstorming, one prompt.** A **Research** button on the idea page opens
  `/p/:publication/ideas/:idea/research`, which lists the idea's earlier research and takes a new request: one text box,
  _the areas to research_, however early the idea is (it may have no notes yet). The app writes the rest of the
  prompt (`prompts/research.md`). There is no dialogue, and any number of requests can be made for one idea, on
  different topics. Each is saved as a **run** (`idea_research`, with its pages in `idea_research_items`), shared with
  the publication's members, and can be deleted (pages already added stay on the reading list).
- **A range of perspectives, unlabelled.** The prompt tells the researcher to look for sources that support the
  direction the writer seems to be taking _and_ ones that challenge or complicate it, best effort. It must not say
  which is which: a label could change how the writer reads the source, and they might not take a page seriously that
  they expect to disagree with. The eval `research-includes-other-points-of-view` checks both parts.
- **Review before anything is added: one click each.** A run is a list; each page has **Add** and **Ignore**, and
  nothing joins the reading list otherwise. (There are no checkboxes or bulk buttons: the owner preferred deciding
  page by page.) A decided page collapses to its title with a green tick (added) or a red cross (ignored) and a
  **Reconsider** button, which puts it back to undecided and expands it again. Reconsidering an _added_ page also
  **removes it from the reading list** (the research item remembers the list item it made, `idea_research_items.link_id`;
  if the writer already removed it there is nothing more to do). Notes taken from the item stay, as when any item is
  removed, but lose their link to it. A page that can't be added can still be ignored. Adding refuses, with the reason,
  a page that doesn't exist, is already listed, or would overflow the list. Added items are marked `research`
  ("Found by research").
- **The AI's reason is kept.** Each page has a reason from the researcher, shown as "Why the AI suggests it
  (unchecked)". When a page is added, the reason is stored with the reading-list item (`idea_links.why`) and shown there
  with the same label, so it can't pass for the writer's own note. Revisit after testing: the owner wants to see how
  this works in use.
- **Search is a port.** `ResearchProvider.find()` takes the app's instructions and a brief and returns
  `{url, title, why}`. The Anthropic adapter (`AnthropicResearchProvider`) uses the provider's web search tool and
  keeps only addresses that appeared in a search result, titled as the result titled them, so an address from the
  model's memory can never come back; the contract suite tests that for every adapter, with `FakeResearchProvider` for
  tests, development and e2e. No route imports a vendor SDK. Web search must be switched on for the writer's Anthropic
  account; if it isn't, the error says so.
- **Every address is checked on the server** (`ReadingChecker`): a plausible http(s) address (the rule for a typed
  link), not already on the list (however `http`/`www.`/`#fragment`/trailing slash differ), not a repeat; then the
  SSRF-safe page fetcher that titles typed links looks at it. The page shows its real title beside the search's, any
  author the page names, and flags `no-title` (allowed, with a warning, listed under the search's title),
  `not-found` and `not-public` (can't be added: the checkbox is disabled and the API refuses). The result is stored
  and not repeated on add (another request to someone's server); the reading list is looked at again then, in case the
  writer added the page themselves or it filled up.
- **The coach may add only what the writer gave it.** The coach keeps a fourth tool, `suggest_reading` (a proposal, accepted
  or dismissed like its others), but the server discards any address the writer did not write in that conversation
  (`addressesWrittenBy`), so the coach's memory can never reach the list. If asked to research or find sources it
  declines and points to the Research tool (prompt-level; eval `declines-to-do-research-and-points-to-the-tool`). An
  accepted suggestion is marked `brainstorm`.
- **Cost, not caps.** There is no limit on how much research an idea can have. A light throttle of 10 searches an hour
  per person remains because each search spends the writer's own money and makes the server look at several sites; a
  failed search stores nothing.
- **What leaves the system.** To the writer's own provider (which does the searching): the areas, the idea's title and
  notes, and the addresses already on the reading list (so they aren't repeated). Never a draft's text (tested). The
  page says so beside the form.
- **Migration.** `idea_proposals` was rebuilt to allow the new tool and hold the address check (a CHECK can't be
  widened in place; nothing refers to the table); new tables `idea_research` and `idea_research_items`; `idea_links`
  gained `why`.
- **Prompts changed (for the owner to review):** `prompts/research.md` and `prompts/tool-suggest-reading.md` (new),
  `prompts/brainstorm-rules.md` (fourth tool; only addresses the writer gave; point to Research).
- **Not done:** re-fetching on add; the friction before citing an unread AI-found page is T34, unchanged; a
  publication-level reading list (T37); idea generation (T6) can reuse the item list with its own origin.

## Links in the draft look like links (#78)

A note from a source went into the draft with a real Markdown link (`([Title](address))`), but the editor had no style
for links and the CSS reset makes anchors look like their text, so it read as plain "(Title)" in brackets. Links in
the editor are now underlined in the accent colour. Because the editor edits rather than navigates, a plain click
puts the cursor in the link; **Ctrl or ⌘ and click** opens it in a new tab (a hint under the editor says so, shown only
when the draft has a link). It is a DOM `click` handler, not ProseMirror's `handleClick`, which only runs on a real
mouse down/up with layout. StarterKit's link `HTMLAttributes` (a tooltip) were not applied, and adding
`@tiptap/extension-link` as a direct dependency just for a tooltip wasn't worth it.

## Dragging a note into the draft (#79)

Each note in the drafting side bar has a grip (⠿) that can be dragged onto the draft; the note then goes in **where it
is dropped**, by the same path as the **Add to draft** button: its words (with the source link, or as a blockquote
for a quotation) as their own paragraph(s), the draft saved first, then the origin recorded and the note set aside.
The editor's drop cursor (a line in the accent colour) shows where it will land.

- **What travels** is only the note's id, under a custom type (`application/x-wordwright-note`); the drop handler looks the
  note up (so nothing else can be smuggled into the draft by a crafted drag), and refuses one that is already in a
  draft or isn't found, with a message. Anything else dropped on the draft (a file, some text) is left to the editor.
- **At the drop point** means a paragraph is split to make room, if the note is dropped in the middle of one; at the
  start of a paragraph it goes before it. If the position can't be worked out the note goes where the cursor is, like
  the button.
- **DOM-level handlers.** The drop is caught with `handleDOMEvents`, ahead of ProseMirror's `handleDrop`, which is only
  called once ProseMirror has found a position (so it can't be exercised without layout, and a drop with no position
  would be ignored).
- **The button stays, and the grip is for wide screens.** HTML drag and drop needs a mouse and doesn't work from the
  keyboard or on most touch screens, and on a phone the draft is behind the drawer. The grip is hidden below 1024px.
- The small drag label shared with the reordering lists moved to `lib/drag-label.ts`, and the test setup now answers
  the layout questions (`elementFromPoint`, `getClientRects`) that jsdom doesn't, so the editor can be dragged over
  in component tests.

## Idea sources: an ordered list of feeds, edited by any member

Idea generation will scan RSS feeds, so each publication holds a list of feed URLs (D2: RSS first). Order is the
priority later used to rank posts, so it is stored as a dense `position` and changed by sending the whole list of
ids (`PUT .../sources/order`) rather than "move X to N": the server refuses (409) unless the ids are exactly the
publication's current sources, so a stale screen can't drop or resurrect a feed, and drag, buttons and two editors
all use the one operation. The UI offers drag and drop (HTML5, grip handle, a small label as the drag image, a
line shows where it will land) and, as the keyboard and touch route, up/down buttons; native drag and drop does not work on
most touch screens, and a library for it wasn't worth a dependency. That interaction lives in one component,
`ReorderableList` (also used for an idea's drafts and notes), so every list people can reorder looks and behaves
alike: it works out the new order and the page's `save` stores it. A move is **shown at once and saved in the
background** (#60): waiting for the server made reordering feel stuck on a slow connection, and the page then also
waited for two refetches. The list keeps its own pending order and ignores what `items` says until the saves are
done; it sends **one save at a time**, each carrying the whole order as it is shown by then, so quick moves collapse
into at most one in flight and one waiting and replies can't arrive out of order, and an older reply can never undo a
newer move. If a save fails (a 409 because someone else changed the list, or the network), it goes back to the saved
order, drops any move built on the one that didn't save, announces that, and the page shows the reason and
refetches. After a success it shows `items` again only once they match, since the page updates them a moment after
the save resolves; if they never do, it gives up after 3 seconds. Rows that other people add meanwhile go last. The
arrows are not disabled while saving. Like drafts, the list is shared working
material, so **any member** can change it, not just the owner. Addresses are normalised (https assumed, fragment
dropped) so the same feed can't be listed twice.

## Feeds are read through a port, with the address checked at connection time

When a source is added the server reads the feed (`FeedFetcher` in `@wordwright/core`; fake and shared contract tests
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

A website can offer several feeds (WordPress also advertises one for comments; some sites have one per category or
podcast), and taking the first was often wrong. `FeedFetcher.discover` lists what a page advertises, using the page's
own titles and without reading each feed, at most 10, feeds of comments (spotted by "comment" in the title or address)
last. Adding a website that offers more than one answers `200 {choices}` and adds nothing; the choices go back one by
one as ordinary addresses, so each is read, checked and rate-limited like any other add. A direct feed address, or a
page with exactly one feed, is added at once as before, at the cost of reading it twice (once to discover, once to
add). Choices are not pre-ticked: which feed to follow is the writer's call.

A feed's recent posts are read by `FeedFetcher.readItems` and kept (`publication_source_fetches`, the posts as a JSON
list) so that opening a page never asks the feed. The rules, in `FeedItemService`: a read is used for 3 hours; a read
sends `If-None-Match`/`If-Modified-Since` from the last one, and a `304` only renews the time; after a failure the feed
is left alone for 30 minutes and the old posts keep being shown, with the error and when it last worked; an explicit
refresh can't ask the same feed within 5 minutes; people asking at once share one read; and each person may start 120
outbound reads an hour (the kept copy is still shown when they hit the limit). Per-feed ceilings like this are what
"be a good client" means in `docs/research/idea-source-feeds.md`, and all reads go through the same SSRF-safe fetch as
adding. What is kept is limited on purpose: at most 50 posts, titles, addresses, authors, the date, and the first 400
characters of the summary as plain text. Feeds often carry whole articles, and the terms of many allow personal reading
and not republishing, so we never store the body. Posts with no web address are dropped (nothing to open), `mailto:`
and similar are refused, and RSS "authors" that are email addresses are not kept. Not done: a background poller (reads
happen when someone looks, so a feed nobody opens is never fetched), JSON Feed, and per-post "seen" state (T6c).

The main list on the Search page (once called Inspiration) is **one list of recent posts across all the feeds, newest first, with a
time window**, not a list per feed (`GET .../sources/recent?days=`, default 30, 1 to 365). The point is to respond to
recent work, so a blog that posts twice a year must not put old posts in front of the writer; the window, not the
number of posts, decides what is "recent". Per-feed lists remain as a preview under each feed. The combined list
reuses each feed's kept copy (so it adds no reading beyond the rules above), reads at most five feeds at once, names
feeds it couldn't read while still using their kept posts, shows a post that two feeds carry once (under the feed
higher in the list), and stops at 100 posts, saying how many it left out. The page shows them five at a time, with Previous / Next above and below (the bottom ones return to the top of the list and move keyboard focus to its heading, since the new page starts far above them; only the upper one is announced to screen readers); paging is done in the browser over the one answer (100 small items, already cached on the server), so moving between pages costs no requests, and a new period or a check for new posts returns to the first page. **Posts with no readable date are not
listed** (guessing when they appeared would put old posts at the top); they are counted and can be seen in the
feed's own preview. The order is by date only: nothing ranks posts by how interesting they are, which would be the
AI or the service deciding what the writer should write about (docs/responsible-ai.md). Adding to the reading list
(T6c) builds on this list.

**Adding posts to the reading list reuses the research review's decisions** (Add, Ignore, Reconsider; a decided
post stays in the list, collapsed and marked, with a way back), applied to the combined list. The server adds a post
from its own kept copy of the feed, named by feed and post id, never from what the browser sends, so only what a
feed really said can be added, and nothing is fetched. A post becomes a publication-level reading item with origin
`feed` and the feed it came from. What is stored is only what was **ignored** (`feed_post_ignores`, by the post's
address as links are compared, shared by the whole publication): whether a post was **added** is read from the reading
lists themselves, so a post added by hand, or since moved to an idea, shows as added, and one whose item is removed by
hand is offered again. Reconsidering an add takes the publication-level item off (notes taken from it stay but lose their
link to it, as when any item is removed); if the post is only on an idea's list, that has to be taken off there. Adding
several at once is all or nothing, the publication's list has the same limit as an idea's, and a post already on a list
refuses the add with the reason. Posts still waiting are shown in date order only, as before: nothing ranks them. A post that has been added or
ignored goes to the **end** of the list (the server sorts, so the cap and the pages see the same order), after every
post still waiting, and decided posts follow in the order they were decided (an ignore's time, or when the item went on a
list), so the latest decision is last. Deciding keeps you on the same page, where the next waiting post takes its place.

Pictures: the feed's own logo, else the site's `apple-touch-icon`/`icon`, else `/favicon.ico`. They are fetched
once, sniffed by their bytes (PNG, JPEG, GIF, WebP, ICO; never SVG, 256 KB max) and stored in the database, then
served from our own origin like publication pictures. Pointing browsers at the other site's image directly would tell
that site who is looking at the list and when. Failure to get a picture never blocks adding: a lettered tile
stands in. Feed details are read only at the time of adding, so they can go stale and sources added before this
existed have none (they show their address); refreshing is a follow-up (T19c).

## Inspiration is its own page (now Search and Read)

The publication's feeds moved out of Settings onto an **Inspiration** page (`/p/:publicationId/inspiration`, linked from the
publication page): they are where ideas start, not a setting, and the posts they bring (T6c) and the reading list will
live nearby. Same component, same API.

A "Find a feed" helper (build a feed address from a service and a topic, from recipes for the Guardian, arXiv,
Substack and so on) was built and then **removed** the next day: in use it wasn't helpful enough to justify the
upkeep, since the address patterns change without warning and each one needs checking against the live site. It is
in the history (commit 393ca10) if the idea comes back, and `docs/research/idea-source-feeds.md` still records the
patterns. Pasting a site's address, which finds the feed it advertises, remains the way to add one.

**Split (#96).** Inspiration mixed two jobs, so it became two steps: **Search** (`/p/:publicationId/search`: the recent
posts and the feeds) and **Read** (`/p/:publicationId/read`: the publication's reading list, and its reading pages). The old
`/inspiration` address leads to Search (to Read when it has `#reading-list`), and `/reading` to Read. Notes and Ideas
moved to 03 and 04.

**Landing pages (#98).** Opening a publication used to redirect to its Ideas step. `/p/:publicationId` is now a page of its
own, titled "Overview", that summarises the publication: its five latest notes with a form to add one, and its ideas. It is
none of the numbered steps, so the menu marks nothing current, like the settings pages. "Latest" notes means newest
made, not the writer's own order on the Notes step. The idea level gets the same treatment (#99), under umbrella #95.

**Search and Read panels (#100).** The publication's page also summarises Search (the five newest posts still waiting for a
decision, newest first, each opening in a new tab, with "See more and set up feeds") and Read (the first five items not
yet read, each opening its reading page, a box to add a web address, and "See the reading list"). The posts panel
asks for the same lists under the same keys as the Search page, at its default period, so they share what has been
fetched; opening the page never asks the feeds to check again. It has no Add or Ignore buttons: deciding is on Search.
The add-a-link form is shared with the Read page (`AddLinkForm`).

**Idea landing page (#99).** `/p/:publicationId/ideas/:id` used to redirect to Notes; it is now the idea's landing page,
none of the numbered steps. Research: the number of sources with a link to the reading list, and the same research box
as the Research page (`ResearchForm`). Pressing **Research** is what spends, as ever; it stays on the page while
searching (up to a minute), then opens the results. The box sits beside a plain statement of what is sent to the
provider. Notes: the shared `RecentNotes` panel. Draft: the idea's drafts in their order (reordering stays on the Draft
step) and **Start a draft** (`StartDraftButton`, shared with the Draft step). A place is left for Refine (#101).

**Idea landing page, second round (#130, #101, #102).** Creating an idea opens its landing page. Research shows the
unread reading list (the publication's `RecentReading`, filed under Research) while there is anything unread, and the
research box only when there is not, so the page offers the next likely move. Notes use `NoteCard`, shared with the Notes
step, so tags and origin show in both. Refine shows the latest AI message (cut at a paragraph after about 600
characters, with "Read in full") and a reply box. Sending from there is the same path as the Refine page: the text is
held in memory (`lib/pending-message.ts`, never in the address) and the Refine page sends it once its thread has
loaded, so the reply streams there and the missing-key message appears there. With no conversation the panel shows the
"Talk it through" invitation and **Start brainstorming** opens Refine, which starts it (`?start=1`). Visiting sends
nothing. The idea's name in the menu and above each step's title links to the landing page.

**Landing page look (#111).** The title is the publication's name with its picture and website beside it, not "Overview". Sections are numbered like the menu's steps, with a light rule above each (`LandingSection`, shared with the idea landing page). The publication's name in the menu, and above a step's title, links to the landing page; so does "← publication" in the idea menu.

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
the title, or the reason it was refused, straight away. Not done: a per-site politeness delay or caching.
The publication's own website field (`SiteUrlSchema`) applies the same `WebAddressSchema` check, with a 300-character
cap. It is checked only when saved, so a site stored earlier that wouldn't pass still displays, but must be
corrected or cleared the next time the publication settings are saved.

## Reading items and notes can belong to a publication; moving them

The publication's feeds will fill a reading list that belongs to the publication as a whole (T37), worked through like an
idea's, and notes made there can later be gathered into an idea. So both kinds of thing need an owner that is either
an idea or the publication.

- **Ownership.** `idea_notes` already had `publication_id` (always) and `idea_id` (null for the publication's own). Reading items
  (`idea_links`) now have the same: `publication_id` is always set and `idea_id` is null for the publication's own. This differs
  from "exactly one of the two" in the task text on purpose: always carrying the publication makes "everything in this
  publication" one query, cascades the publication's deletion directly, and matches notes. The code names an owner with the
  one `Owner` type (`db/owner.ts`: an idea id, or `{ publicationId }`), and every store method that used to take an idea id
  takes an `Owner`, so an idea's lists and the publication's are the same code with a different `WHERE`.
- **A rebuild, with foreign keys off.** SQLite can't make `idea_id` nullable in place. Rebuilding a table other tables
  refer to (notes and research pages point at reading items) would, with foreign keys on, clear those references when
  the old table is dropped. The migration runner therefore takes `{ foreignKeysOff: true, run }` steps: foreign keys
  are off only for that step, the database is checked with `PRAGMA foreign_key_check` before it commits (a failure
  rolls back), and they are switched back on afterwards. Existing rows keep their ids, so nothing that refers to them
  breaks, and `publication_id` is filled in from the idea they were in.
- **Same rules, one set of routes.** The publication's notes use the idea notes' routes (`routes/notes.ts`, mounted twice;
  the publication has no drafts, so no "added" state), and the reading list uses `IdeaLinkService` with a `ListScope`
  (`{publicationId, ideaId}`). Limits are the same numbers, worded for what is full ("A publication can have up to ..."). A
  publication's order is its own list: reordering it never touches an idea's.
- **What "move" keeps** (`MoveService`, all in one transaction, refusing anything outside the publication): _A reading item_
  moves as it is (read date, authors, title, why, origin, feed) and **its notes go with it**, to the end of the
  destination's notes. If the destination already has an item with the same address (compared as links are everywhere),
  the two become one: the one already there stays, counts as read if the moved one was, and the moved item's notes now
  point at it. _A note_ moves with its text, tags, author, origin and quotation mark, to the end of the destination's
  notes, in the order it was arranged (not the order it was picked). It keeps its source by getting a **copy** of the
  reading item at the destination (or using the item there with the same address), rather than taking the item away from
  other notes that came from it; copying is the safe choice since a source can have several notes, and only some may
  be moving. A note that had been put into a draft is no longer "added", because it hasn't been put into any of the
  new owner's drafts. A move that would pass the limits (links or notes) is refused whole, and moving to where
  something already is is refused ("already there") rather than silently doing nothing.
- **The pages are the idea's pages, parametrised by owner.** `lib/reading.ts` has `Owner` (`{publicationId, ideaId}`; null
  idea is the publication) and two composables: `useReadingList` (the list, from the idea's own query or the publication's) and
  `useReadingActions` (add, mark read, edit, remove, each keeping the server's answer in the right cache). `ReadingList`,
  `IdeaLinkItem`, `IdeaNotes` and the reading page each take an owner instead of an idea, and the web client's note
  functions take `ideaId: string | null`. The idea pages behave as before (their tests are unchanged); the publication's are
  `/p/:id/reading`, `/p/:id/reading/:item` and `/p/:id/notes`. Items from a feed (origin `feed`) are labelled "From a
  feed" without the highlighter, which stays for what the AI suggested.
- **The publication's own reading list has no maximum, and forgets (#84).** It is a stream filled from the feeds, so a
  fixed limit would only make people clear space by hand. Instead an item **not marked Keep is dropped a month after it
  was put on the publication's list** (`PUBLICATION_READING_DAYS`, in `ReadingStore.dropOld`): quietly, with no notice when it
  happens, since a notice about the thing you didn't choose to keep is more noise. The age is since the item was put on
  _this_ list, so an item moved back from an idea starts afresh and unkept (`setOwner`), and keeping is the writer's
  tick and nothing else. Two guards: an item **notes were taken from is never dropped** (a note with no source is worse
  than a stale list; the page says so, and it is one clause in `dropOld` to remove), and an idea's reading list and
  notes are never swept (only the publication's own list, `idea_id` null). There is no background job: the sweep runs
  whenever the publication's list is read, counted or checked for what is on it (so the Recent posts list is consistent
  with it), using the real clock, like the time items are stamped with. A dropped item's feed post is offered again,
  as any post not on a list is. The limit of 50 stays for an idea's list, which is part of the work on one idea.
- **Reading lists hide read items by default (#85).** An item that has been read is finished with, and the list is for
  what is still to read. The page's `ReadingList` (idea's and publication's alike) shows only unread items, a **Show read
  items (N)** tick when there are any, and "N read items are hidden" (or "Everything on the list has been read" when
  nothing else is left, which is not the same as an empty list). An item ticked read _during this visit_ stays in
  view until the list is shown again or the tick is changed, so it doesn't disappear under the finger and can be
  unticked. The choice isn't saved: each visit starts tidy. This is purely what is shown: read items are still on the
  list (and, on the publication's, still subject to the month and Keep). The drafting side bar's reading list is a
  different list, for linking while writing, and is unchanged.
- **Moving reading items on the page (#72).** Each reading list has a **Move items** mode: ticks on the items and one
  picker, **Move to** (the publication's list, another idea, and, from the publication's own list only, **A new idea…**, which
  asks for the core idea in the writer's own words, nothing prefilled). It works with a keyboard and on a phone, and
  needs no drag and drop. A new idea is made first and then moved to; if the move fails the idea stays, empty, like
  any idea. The result is said in words ("Moved 2 items and 5 notes to “Rivers”.", plus how many items were joined to
  ones already there) with **Undo** (`lib/move.ts`, which #73 will reuse for notes). **Undo moves the same items back
  through the same operation**, which puts items and their notes back exactly when nothing was joined; when items
  were joined to ones already there, the moved item no longer exists on its own, so no Undo is offered and the message
  says why. Undo onto the publication's list also starts the item's month again and unticks Keep (see above), as any move
  onto it does. Every list showing the moved things is refreshed afterwards.
- **Gathering notes into an idea (#73).** The step where the writer decides what the idea is: the notes of the
  publication (or of an idea) are ticked, a **new idea is made from them** with its core idea typed by the writer (nothing
  suggested or prefilled; the AI is not involved), or they go to an existing idea or back to the publication. `MoveTo` and
  `useMoveDestination` are the one picker for reading items and notes (the publication's own list as a choice only from
  inside an idea; a new idea for notes from anywhere, for items only from the publication's list). Before confirming,
  the page says in words how many notes will move and that **the pages they were taken from are copied** to the
  destination's reading list (or the copy there is used) while the originals stay: copying rather than moving the
  source is what lets other notes from the same page stay behind without losing theirs. A tick offers **"also bring
  the other notes taken from those pages"**, off by default, so the choice is the writer's. "Select all the notes
  shown" respects the tag being shown, so a tag works as a way to pick a group. **Undo** moves the same notes back
  through the same operation: they return to the _end_ of where they were (not their old places), and the sources
  copied to the destination stay there, which the message says. Moves are in the `moves` log either way.
- **The log.** Every move writes a row per thing moved to `moves` (who, when, from and to, whether it merged, grouped
  by a batch id), inside the same transaction. Nothing reads it yet; it is what an Undo (T37c) will use, and it goes
  with the publication.
- **A new origin, `feed`,** is allowed for reading items (with `source_id`, the feed it came from, set to null if
  the feed is removed) for the "Add to reading list" page (T6c). Nothing creates one yet.

## Brainstorming proposes; it never edits, and it never drafts

The brainstorm conversation (design in [brainstorming.md](brainstorming.md)) lets the person's LLM suggest a new
title or notes for an idea, or a new idea, as **proposals the person accepts**; nothing is written otherwise. That
is both the owner's rule that the author's voice and decisions stay theirs and the main defence against prompt
injection (idea notes and fetched page titles go into the prompt): the model has no way to change, fetch or send
anything. It deliberately cannot touch drafts, and draft bodies are not sent to it. One thread per idea is shared
by all members of the publication; each message is sent with its sender's own key, model and prompt, so the thread is
stored in our own neutral format (text and tool calls, no provider "thinking" blocks) to replay across providers.
The default prompt makes the model a sceptical commissioning editor and lives in code; each user can edit their
own copy on the account page.

## Prompts are Markdown files in a top-level folder; `chat()` extends the LLM port

The AI's instructions are prose the owner wants to read and change, so they live in `prompts/` as plain `.md`
files (one per prompt, the whole file is the prompt, with a README saying what each is) rather than inside TypeScript
strings or config. They are read at startup by a small `@wordwright/prompts` workspace package, and the evals read the
same files, so what is tested is what is sent. (If the API is ever compiled instead of run with `tsx`, the `.md`
files must travel with it.)

The `LLMProvider` port gained `chat()` for conversations with tools, in our own types (content blocks, tools as JSON
Schema built from Zod, `text`/`tool_call`/`done` events with a stop reason and usage) so another provider can be
added without touching callers. Choices: no temperature or other sampling options (current Claude models reject
non-default values); reasoning blocks are not represented, so they are never stored or replayed; a reply cut off at
the token limit reports no tool calls (their input may be half-written); provider errors become `LLMAuthError`,
`LLMRateLimitError` and `LLMProviderError` whose messages never include what was sent, since requests hold people's
writing. `complete()`/`stream()` now translate errors the same way, so a non-auth failure is an `LLMProviderError`
(with the SDK error as its `cause`) rather than the raw SDK error.

## A person's brainstorming prompt: stored only if it differs from the default

Each person's own version lives in `user_prompts`; no row (or an empty one) means "use `prompts/brainstorm-default.md`".
Saving text identical to the default (after trimming and normalising line endings) deletes the row rather than storing
a copy, so that improving the default, which the owner expects to keep tuning, reaches everyone who hasn't really changed
it; copies would silently freeze people on old wording. Resetting asks for confirmation only when there is a saved version
to lose. The prompt is capped at 8,000 characters and is only ever used for that person's own requests; the app's own
rules (`prompts/brainstorm-rules.md`) are added after it and can't be edited, so a person's prompt can't remove the tool
rules or the no-drafting rule.

## How the brainstorm conversation is stored, replayed and kept safe

One thread per idea in `idea_messages`, in our own neutral format (text and tool calls only; the model's reasoning is
never kept), plus `idea_proposals` for its suggestions. What people see (`display_text`) is stored apart from what is
replayed (`content`): a person's message is stored with the answers to the AI's last suggestions and, only when the
idea differs from what the AI last saw, a fresh snapshot of it. Snapshots are stored with the message, not recomputed,
so the replayed history never changes and the provider's prompt cache keeps working. The AI's own tool input is
validated with the shared Zod schemas; invalid, unknown or surplus (more than five) calls are kept in the history so
the model sees them answered, but never become proposals, and a suggestion that repeats the idea back is dropped.
Accepting is one transaction that also records the decision with `WHERE status = 'pending'`, so two people can't both
decide it; a suggestion made against older text must be accepted with `overwrite`, comparing only the fields it would
replace. One reply at a time per idea is an in-memory slot (fine for one API process, like the rate limiters; it
needs a shared store if the API ever runs as several), which frees itself after the reply timeout. The reply is
streamed as server-sent events; a reply that fails stores nothing but the person's message, so **Try again** needs no
resend, and **Stop** keeps what was said, marked stopped, without any half-made suggestion. The tool-call text the AI
sees in return ("The writer accepted this suggestion...") is deliberately plain statements about what happened.
Only the `Reader` snapshot section waits on T16 (audiences); until then the AI is told readers aren't described and
asks.

## The brainstorm page: reading the stream by hand, rendering safely, consenting by clicking

The reply is a `fetch` POST read with a small stream reader (`lib/sse.ts`), not `EventSource`, which can only GET and
can't be cancelled like a request; **Stop** aborts the request and also cancels a read that is waiting, so it works
whatever the browser does, and what was said is kept. The page keeps the saved thread as the truth: while a reply
streams it shows a live copy, and only after re-reading the thread does it drop that copy, so nothing flickers or
doubles. Every piece of the AI's text is untrusted: Markdown goes through `markdown-it` with HTML off, images shown as
their alt text only (an image address can leak data), only web, mail and in-page links kept and opened in a new tab
without `opener`; the one `v-html` in the app is in `Markdown.vue`, behind that. (`markdown-it` and its types are the
only new dependencies: hand-rolling Markdown rendering is a worse risk.) Suggestions are shown against the idea as it
is now, as a line diff (`lib/diff.ts`, no dependency), with "added"/"removed" in words as well as colour, and a
suggestion made against older text is labelled and offered as **Apply anyway**. The idea page's Brainstorm link adds
`?start=1` only once it knows there is no conversation, and the page begins at once and drops the parameter, so
visiting or reloading never spends the person's money by itself; a direct visit shows a **Start brainstorming**
button instead. A message that couldn't begin (no key, throttled, someone else replying) goes back into the box.
Found by the axe checks: `role="log"` isn't allowed on a list (it wraps one), and suggestion cards are `h2` under the
page's `h1`.

## Behaviour evals: a smoke test that sends what the app sends

The responsible-AI boundaries (`docs/responsible-ai.md`) are mostly prompt-level, and models differ on them, so they
are spot-checked against the real model. **This is a smoke test, not assurance.** Each case is one hand-written
scenario, the model's reply varies from run to run, and a second model call grades it; showing that a model reliably
behaves a given way would take many runs over many scenarios, which is not feasible here. What the evals can do is
catch an obvious break after a prompt edit, show a gross difference between models, and give planned work a concrete
description. The guarantees are the structural tests (below), which are deterministic and free. The harness (`evals/`, `@wordwright/evals`) is built so that what is tested is what is
sent: it imports the app's own prompt files, tool list (`BRAINSTORM_TOOLS`), system-prompt assembly
(`brainstormSystem`) and snapshot builder (`formatSnapshot`), and calls the model through our `LLMProvider` port, built
by the app's `realLlmFactory`. So it evaluates the adapter and the way the app drives it, not a vendor SDK, and a new
adapter registered in `llm-factory.ts` is evaluated with no change to the evals. The cases are typed data in
`evals/src/cases.ts`; `pnpm eval` writes a promptfoo config from them (the only use of promptfoo, pinned, with its
telemetry and sharing switched off, because the fixtures are writing) and promptfoo runs them through a TypeScript
provider.

- **Not CI, not `pnpm check`.** They cost money, need a key (the project has no shared key; the person running them
  uses their own), are nondeterministic, and rubrics are graded by a second model call
  (`anthropic:messages:claude-sonnet-5-5` by default; `--grader` changes it, and it needs `ANTHROPIC_API_KEY`). The
  harness itself, the request builders and the config generator are unit-tested in `pnpm check`, with the fake adapter
  as a dry run (`--provider fake` needs no key, though rubrics can't then be graded).
- **Keys and trials.** Run in a terminal, `pnpm eval` asks for the API key with the typing hidden (unless
  `EVAL_API_KEY` is set), keeps it in memory, and hands it only to the eval process: it is never written to a file or
  printed. It also asks how many times to run each case (`--trials N` skips the question; 1 to 20, since each trial
  costs the same again) and prints a pass count per case. Without a terminal nothing is asked and a missing key is an
  error. No key should ever be typed into a chat with an agent.
- **Two groups.** `current` cases are behaviour the prompts already ask for, so a failure is a reason to look, not
  proof of a regression (rerun with more trials first). `targets`
  cases define work that is planned (#45 critique, #46 brainstorm wrap-up, #49 distress and flattery) and may fail
  until it lands; that issue promotes its cases. Writing them first makes the issue's definition of done concrete.
- **Structural boundaries are ordinary tests.** `brainstorm-boundaries.test.ts` fails if a tool gains a field that
  could name a draft, an id or a publication, if a planted field survives validation, if a draft could carry text into the
  snapshot, or if the person's prompt could displace the app's rules. Adding to a tool is allowed, but must be a
  decision: the allowed-inputs list in the test has to be edited with it.
- **Adapters.** Looking at a new LLM adapter now includes the contract suite (which must pass) and a run of
  `pnpm eval:adapter` with a few trials, with the summary pasted in the issue. The eval results are information for the
  owner, who decides: a case a weaker model fails is not an automatic veto, and a pass is not a guarantee.
- **Limits.** The cases were written without running them against a real model, so the first run may show a rubric
  that is too strict or too loose; tune the case, and say so in the commit. LLM-graded rubrics can flake: rerun a
  failure before believing it. The critique case calls `complete()` as the route does, so it does not use `chat()`.

## Visual design: Ember

**Decision.** The look is **Ember**: a side menu, IBM Plex Sans for everything (the editor and chat included), warm
stone neutrals, one burnt-orange accent (`#b0440c`), 1px outlines on every control, 6px/10px corners, no shadows,
and a designed dark mode. How to apply it is in [design.md](design.md); the colour roles and components are in
`apps/web/src/theme/`. The owner chose it after three rounds of concepts (screens, contrast checks and write-ups are
kept in [design-concepts/](design-concepts/README.md); they are an archive, not code to import).

**What we were looking for.** Clean and simple (no skeuomorphism or effects); modern practice without the "generic
AI look"; an accessible palette that is _tested_ rather than asserted; easy to work with in Tailwind and easy to
swap or edit later (so semantic roles, not colours, in the markup); and a calm answer to the fact that we show
icons and logos from other websites.

**Options considered, and why each was or wasn't taken.**

| Round | Option                    | What it was                                                                                            | Outcome and reason                                                                                                                                                  |
| ----- | ------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | **Press**                 | A printed page: serif (Newsreader), warm paper, ink-blue, hairline rules instead of boxes.             | Calming, but **interactive elements weren't clear enough** (too little border and contrast), and the owner wanted sans everywhere. Its square logo plate was kept.  |
| 1     | **Ledger**                | Chalk and black, Plex Sans + Mono, ultramarine, hard 1.5px rules, a side menu, lime highlighter.       | **Closest.** Kept: the side menu, Plex Sans, the idea of a highlighter. Dropped: mono for metadata, black 1.5px rules (too harsh), lime used widely (drew the eye). |
| 1     | **Lamplight**             | Dark-first green-black and amber, Literata + Atkinson Hyperlegible, round corners, round logo plate.   | Kept: curved corners and a real dark mode. Dropped: serif text, and **square logos looked wrong inside a round plate** (the app's frame interfered with the logo).  |
| 2     | **Slate** (blue)          | Ledger softened: slate ink, 1px borders, 6px corners, lime only for AI marks, sans in editor and chat. | **Structure adopted.** Its blue accent was judged boring, so only the colour was reopened.                                                                          |
| 2     | **Evening**               | Lamplight in sans with a floating side menu and Press's logo plate.                                    | Good, and the only sans design with curved, soft panels, but Slate was preferred overall; its dark mode and softer corners informed Ember.                          |
| 3     | **Slate · Teal**          | Teal `#0f6b6b` on cool green-grey, soft yellow highlighter.                                            | The safest and calmest, closest to the original Slate. Not chosen: least distinctive.                                                                               |
| 3     | **Slate · Aubergine**     | Deep purple `#5b2a86` on faintly violet neutrals, soft yellow highlighter.                             | Richest, with the highest contrast (9:1) and a literary feel. Not chosen: the owner preferred the warmth of orange.                                                 |
| 3     | **Slate · Ember** (taken) | Burnt orange `#b0440c` on warm stone, pale-blue highlighter, raspberry danger, tuned dark mode.        | **Chosen.** Warm and distinctive, unlike most tools, and fits the owner's taste (teals, burnt orange and deep purples were the three asked for).                    |

**Why Ember specifically.**

- It is the most distinctive of the three colourways and the warmest, which suits a tool for writers, while the Slate
  structure keeps it clear and scannable.
- Warm neutrals (stone, not grey) make the orange feel native instead of pasted on.
- Dark mode is a first-class palette (lighter, more saturated orange with dark button text), not an inversion.
- Every pair is at least WCAG AA. The accent is 5.3:1 on the page and 4.7:1 on its own wash (a link inside a notice), the
  tightest text pair; in dark it is 7.3:1 and 5.5:1.

**Trade-offs we accepted.**

- **Orange next to red.** A standard red error colour is too close to burnt orange, so errors use raspberry
  (`#a8123f`). That is less conventional; errors always carry words and an icon so colour is never the only cue.
- **The highlighter is pale blue**, not yellow, because yellow would sit too close to the orange wash. It means
  "the AI suggested this" and nothing else; the rule is in design.md.
- **One family (Plex Sans).** Clean and legible, and consistent between the interface and the editor, but less
  characterful than a serif or a display face. The `font-display` role exists so a heading face can be added in one line.
- **A side menu** takes 16rem on desktop and becomes a Menu button on phones. The drafting page's notes column
  keeps the `complementary` landmark to itself (the menu is the page header), because tests and assistive technology
  find the notes by it.

**How it is built (so it stays swappable).** Colours are chosen in one file by role; Tailwind's default palette is
turned off, so a raw colour class does nothing; components (`btn`, `field`, `panel`, `chip`, `callout` ...) live in
`theme.css`; the palette test enforces contrast in both modes. Changing colour or character later means editing the
palette or theme file, not the screens.

**Revisit if** users report the orange or the pale-blue highlighter is hard to read in a context we didn't test; a
brand colour is chosen; a screen needs a state the roles can't express (add a role, don't bypass them); or we want a
distinct heading typeface.

## Navigation: the menu follows you

**Decision.** The side menu **follows you** through three levels: Home (Publications), a publication (**01
Search**, **02 Read**, **03 Notes**, **04 Ideas**) and an idea (**01 Research**, **02 Notes**, **03 Refine**,
**04 Draft**; settings at every level are one gear button beside the name (#180), not a menu item; **05 Publish** was a step until #97). The long Idea page was split into those steps, each its own page. How it
works and how to extend it is in [design.md](design.md#navigation-the-menu-follows-you); the mock-ups we compared, with
screenshots, are in [design-concepts/navigation/](design-concepts/navigation/README.md).

**What we wanted.** Lead people through the work without being a wizard: numbers on steps to orient, nothing locked,
a calm page instead of one long scroll, and a clear way to choose what to work on next at each level.

**Options considered.**

| Option                              | What it was                                                                                       | Outcome and reason                                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. The menu follows you** (taken) | The left menu changes with the level and lists its numbered steps, with a "← parent" link on top. | The owner leaned this way and it won: the calmest, the numerals are never ambiguous (only one level's numbers on screen), it needs no second navigation on the page, and on a phone the menu _is_ the step list. |
| B. Steady menu, steps on the page   | The menu never changes; a breadcrumb and a numbered step strip sit under each page title.         | Rejected: two navigation systems at once, taller page chrome, tab-like (the owner leaned away from tabs), and on a phone the strip scrolls sideways so later steps can be off-screen.                            |
| C. The menu is a map                | One tree shows publications, steps, ideas and the idea's steps together.                          | Rejected: the busiest and least calm, grows with the number of ideas, repeats "01, 02…" at two levels in one list, and is a long scroll on a phone. It solves rapid switching, which no one has asked for.       |

**Choices the owner made along the way.**

- **Notes** at publication level are gathered and, when a group becomes an idea, they **appear in** the idea (moved, not
  copied). That arrived with T37d (**Move notes** on the publication's Notes step); the menu needed no change for it.
- **The idea's reading list is separate from the publication's** (as the data already was). The publication's reading list lives
  in Read (step 02); the idea's in Research (step 01).
- **Publish** was for getting a finished draft out; see _Publishing moved to the Draft page_ below (#97).
- **The menu stays on the editor** on a laptop or desktop, but **folds away on the reading and note-taking page**, where
  the writer has the source and the app side by side in narrow windows.

**Choices we made.**

- **Visiting a step never spends money.** Opening Refine used to start a conversation with the AI at once (the old
  Brainstorm button); now Refine opens a page with **Start brainstorming**, as Research has **Start research**.
- **No "complete" ticks and no locked steps.** State is shown as counts (sources, drafts, ideas). We have no way to
  know a step is "done", and claiming so would be prescriptive.
- **A publication opens on Ideas, and an idea on Notes**, the choice of what to work on next, and the thing a new idea
  starts with. Old addresses (`/p/<id>`, `/p/<id>/ideas/<idea>`, `/p/<id>/reading`, `…/brainstorm`) redirect.
- **The numbers are decoration for screen readers** (an ordered list says the order), so the step names are the
  accessible names and tests find links by them.

**Trade-offs.** The menu's content changes between levels, so the "← parent" link has to stay obvious; switching from one
idea to another means going up a level (an idea switcher under the idea's name is the likely fix if that proves
annoying). Several e2e specs had to change because they found links by names ("Brainstorm", "Research", "Settings")
that are now step names in the menu.

**Revisit if** people with many ideas find going up a level to switch tiresome (add an idea switcher, or reconsider the
map).

## Publishing moved to the Draft page (#97)

Publishing is something you do to one draft, not a stage of an idea, and a separate **05 Publish** step listing every
draft sat oddly after Draft. The step, its route and view are gone; each draft's page ends with a publish section
(`DraftPublish`) acting on that draft as it stands on the page, saved or not. `/ideas/:id/publish` redirects to the
idea's drafts so old links work, and the drafts list is the last step.

- **Two copy buttons.** **Copy** puts rich text (`text/html`, from the same safe Markdown renderer as the rest of the app)
  on the clipboard with `text/plain` beside it, so it pastes with its formatting; where the browser can't write rich text
  it copies the plain words instead, and if even that is refused the text is shown to select. **Copy as Markdown** is what
  the old Copy Markdown button did. Plain text is the title, a blank line, then the Markdown body.
- **The Show Markdown toggle went.** The text appears only when the clipboard fails, which is when it is needed.
- **"The next step is to publish it"** (when a draft's critique looks run out) now scrolls to the publish section.
- **Revisit if** publishing straight to a newsletter arrives: it adds buttons to this section, or earns its own page.

## Checkboxes select, switches set a state, and lists share a rail and a toolbar (#88)

The reading lists had checkboxes meaning three different things (Read, Keep, and choose-to-move), four text buttons
per row and a mode switch ("Move items") that changed what a row looked like. The owner's rules, now in
[design.md](design.md#actions-and-lists):

- **A checkbox only selects an item** (for a bulk action). A **switch** sets a state of one item or of the view
  (Read, Keep, Show read items). Selecting is always on: there is no "Move items" mode. Move to… and Remove are bulk
  actions in a toolbar, filters on its left and actions on its right, with a select-all box above the row checkboxes.
- **A left rail** on each row holds the select checkbox (and, on reorderable lists, the grip). It is top-aligned, so
  long items work, and the whole rail is the drag handle. Arrow buttons for reordering appear when a grip is pressed
  (to be judged in use; the alternative was to show them always); they stay until it is pressed again, because
  closing them on blur moves rows under a pointer that is about to click.
- **Remove is held, not undoable** (the item still shows where it came from, a feed or research, so it can be found
  again). Single and bulk Remove use `HoldButton`. The row's Remove is a quiet icon button that turns raspberry on
  hover, because five raspberry buttons in a list pull the eye to the one thing we want people to do least.
- **Keep is on for a link the writer adds by hand** (they can switch it off); only what a feed brings drops off after
  a month, counted from `addedAt` (when it was put on the list, not when it was written). A migration brings existing
  hand-added links into line. An unkept item says on which day it will go.
- **Pagination:** notes show everything; other lists page client-side, five at a time (`PAGE_SIZE`), above and below.
  A list is reorderable or paginated, not both.
- Not done yet (follow-ups): applying the same rail, toolbar and icon buttons to notes, drafts and feeds; tags on
  reading-list items with a bulk Tag… action (#87, needs a schema change).

## Critique points are anchored to paragraphs by id, outside the prose (T9a, #90; part of #14)

**Decision.** Critique used to come back as one block of text. It is now a ranked list of **points**, each about one
block of the draft or about the piece as a whole, plus a one-line summary and a `ready` verdict. Tiptap's Comments
extension is a paid cloud feature (and would limit how many documents we can have), and we do not need real-time
collaboration on drafts, so comments are our own: the server numbers the draft's blocks and the model points at them.

- **Blocks.** `splitBlocks` (`@wordwright/core`) splits the saved Markdown into headings, paragraphs, quotes, code fences
  and top-level list items, numbered `b1`, `b2`, ... Each has a hash of its words (case, spacing and punctuation
  ignored). The draft goes to the model as `[b3] text`.
- **No anchors in the Markdown.** Putting ids in the writer's text would reach Copy Markdown and be published, the
  same reason insertion provenance is kept outside the prose (see above). The ids are only positions in the split of
  the text that was critiqued; they mean nothing for a later version of the draft. T9b stores the hash and a quoted
  snippet with each point so it can be found again after edits, or shown as "this passage has changed".
- **The model's reply is untrusted.** It asks for JSON (via `complete()`, no tool call, so it works with every
  adapter). `parseCritique` reads it, drops points about blocks that were never sent, keeps at most five
  (`MAX_CRITIQUE_POINTS`, in the order given: most important first), and refuses a reply that is not a critique
  (the writer sees "something we could not read, try again"). Points carry no replacement text by design: there is no
  field for it. The prompt also forbids it, and an eval checks that.
- **Kept, and found again (T9b, #91).** Each critique is saved as a round (`critique_rounds`, `critique_points`,
  both `ON DELETE CASCADE` from the draft, so they go with it and with its publication). Only the latest round is shown
  and nothing counts rounds yet (T9c). A point stores its block id, the block's hash and the start of its text.
  The editor places each point again whenever the text changes (`locateBlock`, `@wordwright/core`): first a paragraph with
  the same words (nearest to where it was, if two are alike), then one that still starts with the same words, and
  otherwise none, so a point is never put on the wrong paragraph; it shows under "This passage has changed" instead.
  The hash ignores case, spacing, punctuation, list markers and link addresses, so a paragraph reads the same from
  the Markdown (what the model was shown) as from the editor (what is placed). Two paragraphs with the same words
  and a heavy rewrite are the known blind spots. Marks are decorations, so they never reach the saved text. A point
  can be marked **Read** with a switch when the writer has dealt with it (#110, which replaced a "Set aside" button
  and list): it stays where it is, quieter, its mark leaves the text, and the tab counts only the unread. It is the
  writer's call whether a point matters, so nothing is deleted. The stored field and endpoint are still called
  `dismissed`; only the wording and the interface changed. A Read comment is still placed in the text (just not
  marked), so pressing it still shows its paragraph. If saving the switch fails it goes back, and says so.
- **Rationed (T9c, #92).** A draft gets **3** critiques by default, which each writer can change from 1 to 5 in their
  account settings (`user_settings`, one row per person; no row means the default, so changing the default reaches
  everyone who has not chosen). The count is of the draft's saved rounds, shown before the button is pressed ("2 of
  3 looks used"); when it is used up the button is disabled and the page says kindly that the next step is to
  publish. The server enforces it (409, before anything is sent to the AI), and a failed critique is not saved, so it
  costs no look. Editing a draft does not reset the count. The count belongs to the draft, but the limit is the
  **requester's own**: in a shared publication, rounds made by anyone count against the draft, and each person is held to
  the limit they chose for themselves. Whether a heavy rewrite should earn more looks is for the owner to decide (#103); until then a writer who starts over adds a new draft.
- **Comments beside the draft (#106).** After trying critique in use, the owner moved the comments from under the
  draft to the side area, which is now three tabs: **Notes, Reading list, Comments** (`TabPanels`, WAI-ARIA tabs;
  still the one `complementary` landmark, and on a phone the same slide-in drawer). A comment about a paragraph is
  itself the button that shows that paragraph in the draft; a mark in the text opens its comment. Asking for a
  critique switches to Comments (and, on a phone, opens the drawer when the answer or the error arrives), so the
  result is never hidden. All three panels stay mounted and only hidden, so a half-written note survives a tab
  change. The tab shows how many comments are open. Showing a comment (#109) scrolls explicitly rather than leaving it to the editor's own
  cursor scrolling, which only brings the cursor into view (at the bottom, if it was below): the paragraph goes to the
  top of the window and the comment to the top of the comments area. A page cannot scroll past its end, so while
  comments are showing the draft gets spare room below it (60vh), and the comments area gets the same below its last
  comment when there are several. Streaming the critique was dropped: a spinner is enough.
- **Rung 3, as before.** What leaves the system is the draft's title and body, to the writer's own provider with
  their own key. Rounds are capped per draft (below).
- **Evals.** The two critique cases that targeted #45 ("short and ranked", "says when ready") are now `current`; all
  critique cases also check the reply is the JSON the app reads. They were written without running them against a
  real model: run `pnpm eval` and say if a rubric needs tuning.

**Revisit if** models often send JSON we cannot read (move to a forced tool call, which needs a tool choice on the
`chat()` port), or points need to be about a sentence rather than a paragraph.

**Applied to notes, drafts and feeds (#89).** The notes list (idea and publication) has the same toolbar: select-all and the
tag filter on the left; Merge, Move to… and Delete on the right (Delete is a held bulk action). The "Merge notes" and
"Move notes" modes are gone: every note has a select checkbox in its rail, above its grip. Merge is disabled, with a
reason in its tooltip, while a quotation is selected (it must stay as written); the merged note goes where the first
selected note is, in list order, not click order. "Also bring the other notes from those pages" in the move form is a
switch, since it sets an option rather than selecting an item. Notes are never paginated. Edit and Delete are icon
buttons (Delete quiet until hovered, and held). Drafts only needed the rail (they have no Edit or Remove). A feed's
Remove is an icon button and a plain click, not a hold, because the feed is easy to add again.

**The grip button became a dotted rail (#104).** A small grip button in the rail looked wrong, so the rail itself is dotted
(`list-rail-grab`) and is the drag area and the thing to click or tap for the arrows. A hidden "Reorder" button stays in
it for the keyboard and screen readers. Clicking the rail's checkbox or the arrows does not toggle the arrows.

**Rail polish (#112).** Dots are inset and tiled with `space` so no dot is ever cut by an edge. The arrows are always laid out
and invisible until the pointer is over the list or focus is in it, then shown for every row (or none), and hidden while
dragging; laying them out always means rows are taller than their content (about 90px at least), a deliberate trade for
nothing jumping when the pointer arrives. They are 28px, solid when disabled, and centred in the row under the checkbox.

**Reorderable rail: a grip, not dots (#114).** The dotted texture behind the checkbox and arrows looked odd, and a texture is not a convention. The rail is now plain, with a six-dot grip (the usual sign of "draggable") under the checkbox. The grip is a bare glyph so it doesn't look like a button; the _whole rail_ tints on hover and has the grab cursor, which says the handle is the rail, not the glyph. The arrows no longer show on hover (that hid the grip just when the pointer arrived): a click or tap on a rail swaps grip for arrows on every row, in the same slot, until the person clicks elsewhere, presses Escape or drags.

**Bulk tagging (#139, under #87).** Tags are set on several notes in one request (`POST …/notes/tags` with `ids`, `add`, `remove`), not a loop of per-note saves, so the change is atomic: if any note would end with more than `MAX_NOTE_TAGS` tags, none is changed and the reply names the note. Tags are compared ignoring case; adds keep a note's existing order and go last; removes win over nothing (a tag asked to be removed and added in one request ends up added). Quotations can be tagged, since tagging does not touch their words. The panel (`BulkTagPanel`) is shared with the reading list, which gets tags and the same action next (#140, #141). A new tag filter clears the selection, as every filter does.

**Tags on reading-list items (#140, under #87).** Reading items carry flat tags like notes do (same rules: tidied, case-insensitive, at most `MAX_NOTE_TAGS`, kept in the order given), in their own table (`idea_link_tags`, deleted with the item). They are set as a whole (`PUT …/links/:id/tags` on an idea, `…/reading/:id/tags` on the publication), edited in the item's edit form, and the list has the same tag filter as notes (a new filter clears the selection). A moved item keeps its tags. When a moved item joins one already at the destination (same address), its tags are added to that item's, each once ignoring case, up to the limit (extras beyond it are dropped rather than refusing the move). The copy of a source item that a moved _note_ takes along does not get the tags: tags describe how a writer groups things in one place, not the source itself.

**Bulk tagging reading items (#141, under #87).** Reading lists get the same **Tag…** action as notes, through the shared `BulkTagPanel` and one atomic request (`POST …/reading/tags` on the publication, `…/links/tags` on an idea: `ids`, `add`, `remove`). The add/remove rules and the refusal when an item would pass `MAX_NOTE_TAGS` live in one place (`services/tag-change.ts`) for both notes and items, so they cannot drift apart. With #139, #140 and this, #87 is complete.

**Tags one at a time (#143).** The comma-separated Tags field is gone from the note and link edit forms. Tags are entered under the item, one per Enter (`TagEntry`), saved as soon as each is added, with the whole set sent each time (so the API is unchanged and a failed save puts the tag back off). That also lets quotations be tagged one by one, which the edit form could not offer because quotations cannot be edited. Bulk tagging uses the same entry so single and bulk behave alike. Suggestions are a native `<datalist>` (no extra buttons). A save chain per item keeps rapid Enters in order.

**Filters behind a funnel (#144).** The list header was crowded, so filters (tag buttons, Show read items) fold behind a funnel button and open a row under the header. The funnel is only there when there is something to filter by, and while a filter is on it is marked and a chip names it, so people are never left wondering why items are missing. The open/closed state is not remembered across visits. Select all was already limited to what is showing after the filter (notes and reading lists); tests now say so for both.

**Bulk actions in the header (#145).** Actions that do something to a selection are hidden until something is selected. An action that needs input takes over the header instead of opening a panel under it (Tag… and Move to…): the rest of the header is its form, ending in a tick and a cross as icon buttons, with the explanation behind an info icon (`InfoTip`) so the form stays on one line where it can. Merge and Delete/Remove N stay one-click (Delete asks in a dialog). The header's form closes if the selection empties. The old `BulkTagPanel` (a panel under the header, with switches) became `BulkTagFields`, with press-to-remove chips; `MoveTo` is now an inline row. Tooltips are CSS (hover or focus within), not a JS popover.

## Publication descriptions are written by the writer; AI drafting was removed (#150)

The owner removed "Draft from a few posts" (#134, #135, #136, and the later #149 plan to fetch whole posts and page back
through a site's feed). Drafting a description from sample posts spent the writer's tokens on a text that, under our own
responsible-AI rules (reflect only what the posts show, say when the evidence is thin, never guess readers, never write
what is published), was not worth what it cost, and fetching whole posts would have cost more. So nothing now creates an
AI-inferred description.

- **Removed:** the sample-posts picker, `POST /publications/:id/publication/{posts,samples,description}`, the publication-description prompt
  and its evals, `PageTextFetcher` (its port, HTTP adapter, fake, contract and readable-text extraction: nothing else used
  it), and the rate limiters that went with them. `PAGE_FETCHER` remains: it still chooses the page _title_ fetcher.
- **Instead, guidance.** The describe page opens on "What makes a useful description" (also folded above the editor in the
  publication settings): what it is, what it covers, who reads it (by interests and knowledge, never by who they are; say so
  when the writing is personal, so the assistants don't ask for an audience), how it is written, and what feedback the
  writer wants, with an example, and a note that it is the writer's account of the publication and is never read as
  instructions. The points follow how the prompts use the description (`prompts/brainstorm-rules.md`, `critique.md`,
  `research.md`).
- **Origin handling removed too (#151).** With nothing live to keep, a migration dropped `description_origin`,
  `description_confirmed`, `description_sources` and `description_edited`; the "AI draft" mark (`DescriptionOrigin`),
  `POST /publications/:id/description/confirm`, the unconfirmed check in `usablePublicationDescription` and the publication fields that
  carried them went with it. A description is always the writer's own words, and every saved one reaches the assistants.

## What is waiting on you: reminders without nagging (#159)

One read, shown in one place. `GET /api/publications/:id/attention` answers, for the person asking: drafts offered to them,
their own offers still unanswered, and, for drafts they edit, how the reviews they sent stand per snapshot (reading,
finished, closed, and reviewers' comments not yet resolved). The publication's landing page shows it above everything else
and shows nothing when nothing waits; the draft page already carries its own offer controls, and gains the same per-copy
summary beside the reviewers. A draft is flagged ("Reviews finished, comments to answer") only when every review of a
snapshot is over, at least one was finished and comments remain unresolved: closed-only reviews and reviews still
being read never flag. A reviewer's own list of reviews is their landing page (#157).

Deliberately absent, as `docs/responsible-ai.md` asks: no extra emails (the three that exist are the offer, the
invitation and "has finished reviewing"), no count in the menu or anywhere outside this page, no streaks, nothing that
reappears after being answered. The query is read when the page opens (and after an action on it); there is no polling.

## Reviewers: how they were built (#157)

ADR 0002 is the decision; these are the details.

- **A reviewer-only account** is `users.reviewer_only = 1` with a null `handle`. The one place that enforces what it
  may reach is `requireUser` (`reviewerMayReach`): who it is, sign-out, `/reviews/*`, accepting an invitation and
  deleting itself; everything else is 404, as for a stranger. A test walks every route the app registers as a reviewer.
  The web app mirrors it (the router sends such an account to its reviews, and the publication list is never requested).
- **A review is of a snapshot** (#158, ADR 0001): when the editor sends the draft, its title and body are frozen in
  `draft_snapshots` and every person asked reviews that copy (`draft_reviews`: open, ended, closed; one per snapshot and
  reviewer). The editor keeps writing; sending again makes a new snapshot, and more from the same person is a new
  review. Reviewers' comments are anchored (block id and hash) to the snapshot and carry their `review_id`; the editor's
  list places them on the live draft by hash, and ones whose paragraph has since changed sit under "This passage has
  changed". They stay out of a member's own live-draft comment list. Invitations carry the snapshot they were sent with.
- **States:** _open_ (can comment), _ended_ (the reviewer pressed **End review**, which emails the editor once with the
  number of comments and no text, and is final for that snapshot) and _closed_ (the editor, or an owner, stopped
  accepting: one review, or all open ones). Ended and closed reviews are read-only and still show the snapshot and the
  reviewer's own comments. Comments, ends and closes send no other email.
- **Members can be asked too** (`memberIds`): they get a review of the same snapshot at `/reviews/:id`, an email with that
  link, and a "Drafts to review" list on their home page. Only the editor sends; owners can still close reviews.
- **Who may send and close:** only the editor sends (with a confirmed address); the editor or an owner can close; capped per person (shares the
  publication invitation cap of 20 a day) and per recipient (5 a day). The answer is the same `202` whatever the address,
  and nothing is sent to an address that is blocked, already reviewing, or already a member.
- **Only a name and password** make a new reviewer account (the link proves the inbox, so the address is confirmed).
  Someone who follows the link with an existing account signs in and the review is added to it. A new person who would
  rather use Google gets a full account through the ordinary sign-up and then follows the link again; reviewer-only
  accounts are not made through an identity provider (a gap in the issue's wording, kept simple on purpose).
- **Upgrading:** accepting a publication invitation as a reviewer-only account gives it a generated username (the app asks
  once whether they'd like another) and keeps its reviews; **Start writing** chooses a username and does the same.
- **Comments** are the ones from #156: a reviewer's are visible to them and the editor only, and follow the keep-my-name
  choice at account deletion like members' do.

## Draft editors: how they were built (#154)

- **A version number, not the timestamp.** `drafts.version` counts saves and a save quotes the one it started from
  (`UPDATE … WHERE version = ?`); two saves in the same millisecond can't both win, and a stale one gets 409. The page
  keeps what the person typed and tells them to reload; newer words from elsewhere only fill the fields if nothing
  unsaved would be lost. Non-editors pick up changes through the ordinary refetch on focus, so no new dependency.
- **A draft always has an editor.** `editor_id` is `SET NULL` on user deletion as a backstop, but removing a member
  and deleting an account hand their drafts to the longest-standing remaining owner first (`handDraftsToOwner`).
  Existing drafts went to their creator, or the publication's oldest owner if the creator was gone.
- **Non-editors see no AI comments.** `GET …/critique` returns `round: null` for them, following independent review
  (below). Setting a comment aside is the editor's too. (#156 gave everyone a Comments tab for their own comments, and
  `used` is now 0 for non-editors so the route does not tell them how many critiques were made.)

## Handover: how it was built (#155)

- **One table, one history.** `draft_handovers` holds offers, asks and reassignments with a status; "one open offer per
  draft" is a partial unique index, so two simultaneous offers can't both win. The page's state (open offer, open asks,
  history) is one read, and every action answers with it.
- **Asks have no email and no deadline.** They only show on the editor's page. An ask is answered when its asker becomes
  editor, whichever way (the editor's offer, or an owner's reassignment).
- **An editor change cancels the old editor's open offer.** Whether by accept, reassignment, or the editor leaving: an
  offer from someone who no longer has the pen means nothing. An offer to someone who leaves is declined.
- **History names people by id, and follows the keep-my-name choice.** Names are looked up while the account exists. On
  account deletion the name is copied into `kept_actor_name` / `kept_member_name` only if the person chose to keep it
  (#153), so the log reads the same as their notes; otherwise it says "a former member" and no row holds the name.
- **The system's reassignments are logged too.** When an editor leaves, is removed or deletes their account, each
  draft that passes to an owner gets a `reassign` entry with no actor and `reason = 'left'`, shown as "Passed to X
  when the previous editor left".
- **Email:** one template (`handoverOfferEmail`), sent in the background with only the error logged; the offer is
  throttled at 20 a day per editor. No new configuration.

## Human review and draft editors (#26)

Decided with the owner in triage. Terms are in `CONTEXT.md`; the hard-to-reverse choices are `docs/adr/0001-reviews-are-of-snapshots.md` and `docs/adr/0002-reviewer-only-accounts.md`. Built as #152–#159.

- **One editor per draft.** The member currently responsible for its title and body; the creator at first. Only the editor saves, uses Add to draft, publishes, invites reviewers or asks for an AI critique. Saves are version-checked (409 on a stale save); no live collaboration. The publication role `editor` is renamed `member` (#152) so the word means one thing.
- **Handover is explicit.** The editor offers the draft to a named member, who accepts; until then the offerer stays editor and can withdraw. Any member can ask, which only prompts the editor. An owner can reassign an absent editor's draft, and it passes to an owner when the editor leaves or deletes their account.
- **One comment model; independent review.** AI critique points and people's comments are one kind of thing (anchored to a paragraph or the whole draft, never carrying replacement text). The editor sees all of them with authors, the AI's marked; every other person, including reviewers and owners who are not the editor, sees only their own. This keeps reviewers independent and leaves resolving disagreement to the editor. No replies for now. **Resolved** (editor only) hides a comment; nothing is deleted.
- **Humans are not capped.** The rationing exists because an LLM always finds something to tweak. Human comments do not count against critique rounds.
- **Reviewers.** Invited by email to a draft, they review a snapshot (ADR 0001) with a reviewer-only account (ADR 0002). A review is open, ended (the reviewer pressed End review, which emails the editor once with a comment count) or closed (the editor stopped accepting); ended and closed reviews are read-only and still show the snapshot and the reviewer's comments.
- **Emails** only for a handover offer, a reviewer invitation and a finished review. Comments send none. In-app reminders for open handovers and reviews come last (#159).
- **Names outlive accounts, by choice.** People get credit for their notes and comments in publications that continue. Deleting an account asks whether to keep the display name on them (default yes) or show "a former member"; the email and handle are never kept (#153).
- **Not built:** human "suggested change" text (a later issue if wanted), replies, real-time editing.

## Comments: how they were built (#156)

- **One table, `draft_comments`.** A critique's points became comments by migration (`critique_points` is gone;
  `dismissed_at` became `resolved_at`); `critique_rounds` stays and holds only the summary and the ready verdict. A comment
  with a `round_id` is the AI's, so there is no `is_ai` flag to disagree with it. `author_id` is `SET NULL` on account
  deletion, and `kept_name` follows the other contributions (#153): copied at deletion only if the person chose to keep
  their name, read as `coalesce(users.name, kept_name)`. A member who merely leaves a publication keeps their name for free
  because the account still exists.
- **Visibility is decided in one function.** `visibleComments` (editor: everything including resolved; anyone else: their
  own open comments) is the only way a route returns comments, and the store has no per-person query to misuse. The
  critique summary is the editor's too, and `used` reads 0 for others so a count cannot leak.
- **Only the latest critique round's comments are listed.** Earlier rounds stay on record, as before, but listing them
  would put up to 15 AI comments beside the people's. Human comments are listed whatever the round.
- **Resolved is hidden, not deleted.** The editor sees a "Show resolved" switch (with a count) only when there is something
  to show; the author sees nothing of a resolved comment. Numbers follow the whole list, so showing resolved ones does not
  renumber the rest.
- **Anchoring by choosing from a list.** A member picks "The whole draft" or a paragraph from a select (keyboard- and
  phone-friendly; selecting text in the editor was left out). The paragraphs come from the draft as _saved_, because that is
  what the server finds the block in; a stale choice gets a 400 saying to reload.
- **People's marks are not highlighter-coloured.** The highlighter is only for what the AI suggested, so a person's comment
  gets a plain edge and mark in the text, and a plain number chip in the list.
- **The AI boundary is structural.** `formatDraftForCritique` takes only the draft's title and body (and the publication
  description); a test writes comments from two people and checks the request sent to the model contains none of them.
  No prompt changed.

## Rephrase: options for a passage or title (#161, part of #15)

Decided with the owner in triage of #15. Terms (**Rephrase**, **Aim**, **Option**) are in `CONTEXT.md`. Rung 4 of the
assistance ladder. This task is the service; the window is #162, the title entry point #163, social posts are parked (#164).

- **One feature, not four.** Titles, openings, closings and any passage a writer is struggling with are the same thing:
  select the wording, say what it should do, get options. The writer selects text (inside one paragraph, 5 to 150 words)
  or uses the title; there is no separate "opening" or "closing" because we cannot tell whether a writer has written one.
- **The Aim comes first, and is required.** At least three words, in the writer's own words, also for titles. It is
  friction on purpose (docs/responsible-ai.md, principle 3) and what makes the options fit.
- **No per-draft quota (this amends principles 1 and 4 and priority 4 in `AGENTS.md`).** The first plan was a small
  total of option sets per draft. The owner judged a number arbitrary: the cost is the writer's own, and someone who
  wants to game it can. What stays: another round needs a changed Aim (compared ignoring case and spacing, against every
  earlier Aim in the window), and a window allows the number of rounds in the critique-looks account setting (default 3),
  shown as "Round n of 3". That limit is in the window, not on the server, so it is friction and not a guarantee:
  reopening starts again, as adding a new draft gets round the critique limit. Critique's own cap is unchanged.
- **Stateless on the server.** The request carries the rounds already asked (Aim and options), the server checks and
  counts nothing, and the only record will be made when an option is used (#162, a row beside `draft_insertions`).
- **How many, and how long.** Short wording (a title, or up to 25 words) gets a list of about 8 options (5 to 10
  accepted); longer wording gets a carousel of about 4 (3 to 5). An option may be at most the larger of 1.5 times the
  wording or the wording plus 15 words, and a title option at most 20 words, so a phrase cannot become a paragraph.
  Options over the bound, blank ones, repeats, the wording itself and anything already offered are dropped; too few left
  is a 502 telling the writer to try the aim another way. A title needs a draft of about 300 words to work from, since
  titles are best made when the piece is nearly done. **All of these numbers are in `REPHRASE`
  (`packages/core/src/rephrase.ts`)**, to tune in one place. A heading counts by its words; there is no special case.
- **What is sent, and who may ask.** The Aim, the wording, the draft's title and body, the publication description and any
  earlier options in the window, to the writer's own provider. Never notes, brainstorm threads or comments (a test
  fails if they appear). Only the draft's editor can ask, as with critique.
- **Structural and prompt-level.** Structural: the AI has no tool that writes to a draft; the server checks counts,
  lengths and the changed Aim; text enters a draft only by the writer's "Use this". Prompt-level, eval-tested and not
  guaranteed (`prompts/options.md`, `evals/`): options differ in approach, reword without adding facts or quotations,
  say what they cannot supply if the Aim asks for new material, and treat the draft, wording, Aim and publication description
  as data. A prompt change is a product change: the owner reviews it.
- **Not built yet:** the title button (#163); social posts (#164). The window and the record on use are #162, below.

### The Rephrase window and the record on use (#162)

- **A dialog on top of the draft, holding all the state.** The wording, the Aim, the options and the rounds asked live in
  the window (`RephraseDialog`); closing it loses them, and opening it again starts at round 1. The round limit is the
  critique-looks setting (default 3) and a new round needs a changed Aim, both checked in the window. The server only
  checks the Aim has changed between the rounds it is told about, so this is friction and not a guarantee (as decided above).
- **The window reads the saved draft.** The AI is sent the saved draft, so the draft is saved before every request, as for
  a critique. The selection's position is remembered when the button is pressed, and "Use this" replaces exactly that range
  with plain words (any bold or link inside the selection goes with it); a passage cannot be edited while the window is open,
  so the range cannot move.
- **Choosing an option is not using it.** An option's button only puts it in the wording field; nothing reaches the draft
  until "Use this". Using an option unchanged is allowed (a forced edit invites a stray space). The window disables "Use
  this" until the wording differs from what was selected.
- **What is recorded, and when.** Only when "Use this" is pressed with words that began as an option (the last one put in
  the wording field, even if it was then edited): `draft_insertions` gets a row with origin `option`, the option as offered,
  the words as used, the Aim and the kind (`passage` or `title`), and who used it. Words the writer wrote themselves leave
  no row. `draft_insertions` was rebuilt (a `CHECK` cannot be widened in place) with `note_id` null for these rows. The
  server cannot check what was offered, so the row is the writer's report, for honesty about origin and not as proof.
  The name follows the #153 rule: kept at account deletion only if the person chose to, otherwise no trace.
- **The draft's list of origins says so.** "Where some of the words came from" now includes these rows ("Words that began as
  an AI option, for “<aim>”", with the person who used it as the chip, and whether they are still as inserted).
- **One modal behaviour.** Focus in, Tab kept inside, Escape, focus back: now `lib/modal.ts`, used by `ConfirmDialog` and
  the Rephrase dialog, so a third dialog does not copy it.
- **Layout.** The button row under the editor now wraps, since a third button no longer fit beside the others on a phone.

### Rephrase for the title (#163)

- **Same window, no new rules.** The title is `kind: 'title'` in the same dialog and endpoint; short options, at most 20 words
  each. The button is beside the title, not among the editor buttons, because it acts on the title and needs no selection.
- **Gated on the draft, not the title.** Titles are best made when the piece is nearly done, so the button waits for
  `REPHRASE.titleMinBodyWords` words of body (and a non-empty title to start from). The server checks the same, before spending.
- **Using an option sets the title and saves**, and is recorded like a passage (kind `title`). The record's "still as inserted"
  check is skipped for titles, since the title is a single field.

## Exporting your writing: Markdown only, by role, built on request (#167)

A zip of Markdown files, nothing else, so a writer can open their words anywhere (priority 4: no lock-in). Chosen with
the owner: **no JSON** ("I don't think JSON will be useful generally"), **one file per publication, idea and draft**, with
the idea and publication files holding bullet lists of notes and the reading list and relative links to what belongs to
them. Layout: `README.md` at the top (what is in, who gets what, what is left out), then `<publication-id>/` with
`<publication-id>.md`, `ideas/<slug>.md` and `drafts/<slug>.md`. File names are slugs of titles (letters, digits and
hyphens, numbered when two collide), so a title can never name a path; the zip writer refuses any other path. The
publication's folder and file use its id (`<handle>-<name>`), not its name, for the same reason. An idea has no separate
aim: its name is the writer's own statement of the core idea, so that is its heading.

- **Who gets which drafts.** An **owner** gets every draft in the publication, including other members'. A **member** gets
  the drafts they are the editor of or started (a draft they started and handed away is still listed, marked "now edited
  by someone else"); the idea file says how many drafts by other members aren't included. Notes and reading-list
  items are everyone's and are all included. Members can read every draft in the app, so this is a rule about what
  _leaves_ the system in bulk, not about reading; the README says so.
- **Credits.** Notes carry their author's name and the date; a deleted account shows as "a former member". Reading
  items record when they were added but not by whom, so they show only the date (adding an author column would be a
  migration for little gain).
- **Left out.** Comments (human and AI), critiques, snapshots and reviews, brainstorm conversations (anything worth
  keeping should already be a note), API keys, and every email address. The AI's `why` on a suggested reading item is
  left out too: it is the AI's claim, not the writer's words.
- **Built on request, downloaded at once** (`GET /api/account/export`, all the person's publications, and
  `GET /api/publications/:id/export`, one), with no job queue or emailed link: it is a few seconds of text. Throttled to 5
  an hour per person because it costs the server work, shared by both routes. A reviewer-only account has neither
  route (404 like the rest). The zip is written by hand in `apps/api/src/export/zip.ts` (about sixty lines on
  `node:zlib`) rather than adding a dependency for small UTF-8 text files.
- **Where.** The account page (above the delete-account section, which links to it) and each publication's settings.

## One word, "publication", and a reset schema (#174)

"Profile" and "venue" named the same thing in different places, and neither says what it is. A **publication** is where a
writer publishes: a Substack, a blog, a magazine, a newsletter or similar. The word is used in the code (`publicationId`,
`PublicationStore`, `/api/publications`), the database (`publications`, `publication_members`, `publication_id`
columns), the prompts (`<publication_description>`), the screens and the docs. The OAuth `profile` scope is the
identity provider's word and is unchanged. Archives (`docs/design-concepts/`, `TODO.md`) keep the old words.

- **Why reset the migrations.** There are no live deployments, so renaming tables through appended migrations would have
  kept a history nobody needs: sixty steps, a handle backfill, two data-rewriting migrations and several table rebuilds.
  `MIGRATIONS` is now one entry, the whole schema, and later changes append as before.
- **Vestigial structure dropped.** `ideas.notes` (no longer read since notes became rows; the store assembles
  `Idea.notes` from them), the nullable `drafts.idea_id` (every draft has an idea), and the migration helpers that backfilled
  them. `users.handle` stays nullable because reviewer-only accounts have none.
- **Existing development databases are refused.** A file from before this has a higher schema version than the build
  knows, and the app says to upgrade rather than downgrade. Delete it. The default file is now
  `apps/api/data/wordwright.sqlite` (it was `lfwa.sqlite`), so a new one is simply started beside the old.
- **Prompts changed.** The wording of the AI's context changed from "venue" to "publication" (the instructions already
  said "publication" in most places); behaviour is meant to be the same, but the owner should review `prompts/`.

## The working name "lfwa" is gone (#178)

The package scope is `@wordwright/*`, the cookies are `wordwright_session` and `wordwright_oauth`, the theme choice is stored
under `wordwright-theme`, notes are dragged as `application/x-wordwright-note`, and the key used to encrypt saved API keys is
derived with the context `wordwright-secret-box`. With nothing live, the cost is that existing sessions, saved API keys
(encrypted under the old context) and theme choices reset; development databases were already being deleted for #174.

## Brainstorm: knowing when to stop (#46)

The coach is told to ask one question at a time and to say plainly when the idea is clear enough to draft (`prompts/brainstorm-rules.md`).
The page adds the writer's own way out: an "I have enough: go and write" link beside Send, always available, so ending the session
is a choice they can make without waiting for the coach to say so. **No cap on questions per session.** The prompt and the
writer's exit are enough for now, and a count would need a decision on what resets it (as for critique looks, #103); revisit if
real sessions run on. The three behaviour evals for this (says when ready, doesn't reopen when the writer stops, asks one
question) moved from `targets` to `current`; they have not yet been run against a real model (#6).

## Persona, flattery and distress rules are the app's, not the writer's (#49)

"An AI, not a person", "no flattery, hold a fair criticism" and "in distress, drop the editor for a short warm reply" were already
in the default coach prompt, which a writer can rewrite. They are now also in `prompts/brainstorm-rules.md`, which always follows
the writer's own prompt (principle 7), so they cannot be edited away. The distress rule is deliberately narrow: acknowledge, point
to people close to them or a professional or helpline, no probing, no notes recorded, and no invitation to say more because other
publication members can read the thread (principle 9). It is a prompt-level behaviour and is not claimed to be reliable; the three
cases for it (`distress-gets-a-short-warm-reply`, `no-unearned-praise`) moved from `targets` to `current` and have not yet been
run against a real model (#6). Writing-to-think at publication level (#25) is separate and not started.

## First real eval run: the prompts asked for more than we wanted (#6)

The first run against a real model (3 trials) passed the distress and no-flattery cases (3/3 each) and failed the stop-and-ask cases
from #46: the model agreed the idea was ready and then gave three to five bullets of "what I'd do next", because
`brainstorm-rules.md` said to "say what you would do next"; it added advice and "come back if you get stuck" after the writer said
they were done, because nothing said not to; and it asked two or three questions in an opening, because the default prompt said
"two at most". The model had followed the prompts, so the prompts changed: one question (examples of an answer stay inside it),
one next step said in a sentence, a sentence or two to close with no further advice and no invitation back. The question check
counted `?` characters, which fails "a river, a moment, or something you read?"; it is now a rubric that allows examples inside
one question. Not yet re-run on a real model: the changed cases need `pnpm eval -- --case says-when-the-idea,does-not-reopen,asks-one-question --trials 3`.

**Follow-up, second run.** Of the three changed cases, `does-not-reopen-when-the-writer-stops` and `asks-one-question` passed 3/3. `says-when-the-idea-is-ready`
still failed 0/3 although the replies were short, asked nothing and ended with "Good luck": each added a second small pointer (where to
start, and whether the 40cm is per summer), and the rubric allowed one. The prompt already says to give one thing; the rubric was stricter
than what #46 is for (no new questions, no more brainstorming, no long list), so with the owner's agreement it now allows a short paragraph or
two with one or two pointers and no list. This moves the bar after seeing the failures, so the case needs a real rerun
(`pnpm eval -- --case says-when-the-idea --trials 3`) to show it still catches a long list of next steps.

## An eval for the notes the coach records (#184)

`notes-reuse-the-writers-words` gives the coach a message with three separate points (none already in the notes) and checks the
`add_note` calls it makes: two to six of them (a note per point as it is made, not none and not a flood), each of thirty words or
fewer, each mostly the writer's own vocabulary (at least 60% of its words of four letters or more appear in the message, so a
tidier paraphrase fails), and a rubric that none is the coach's own view or a point the writer did not make. "Mostly their phrases"
is measured by words, not by a shared run of words, because a faithful note often rearranges them ("parents with children" for
"parents who bring their children"). No prompt changed. It has not been run on a real model: until it has, treat the 60% and the
count as guesses to tune.

## Large pictures are shrunk in the browser (#185)

A phone photo is several MB, and the limit is 1 MB, so the writer used to be told to resize it themselves. `ImageField` now redraws a
PNG, JPEG or WebP that is over 1 MB or over 512px on its longest side onto a canvas, in the same format (quality 0.9 for JPEG and
WebP), before it is uploaded. **In the browser, not the server**: no native image library to build and ship (`sharp` would tie the
Docker image and the host to a binary, which waits on D3, #22), and the bytes that reach the API are already small. **GIFs are
left alone**, because redrawing keeps one frame, so a big GIF is still refused with the old message. The server keeps every check
(size limit, sniffed type); the browser is a convenience, never trusted. A file the browser cannot decode now gets "could not be read
as a picture" at once, rather than the server's "not a PNG, JPEG, WebP or GIF" after an upload. While a picture is being read the field says so, and if another is chosen meanwhile the last one chosen wins. The storage port is separate (#9).

## Where you're signed in: a label and a time, nothing else (#165)

After losing a laptop or using a shared computer, a writer can see their sessions and end them. **What is stored per session** is a
public `id` (random, so the page can name a session without the cookie or its hash ever leaving the server), a **coarse device
label** and `last_used_at`; nothing else was added. **No IP address, no location, no raw User-Agent.** Those would be personal data
kept for a screen that only has to say "is this me?", and a location from an IP is often wrong enough to alarm. The label comes from
`auth/device.ts`: a few ordered regexes over fixed words ("Edge", "Safari", "macOS"...), run over only the first 512 characters, so
the client-controlled header can't make it slow and **nothing it sends is ever stored or shown back** (a hostile header can't plant
text on the page; the worst it gets is "Unknown device"). Sessions from before this change are "Unknown device" and can still be ended.
`last_used_at` moves on at most once an hour, so reading a page doesn't write. **Throttling:** none of the new routes can be used to
guess a secret or costs money (ids are 122-bit random; ending a session needs an existing one), so they get none beyond sign-in; a
stranger's id is 404 like a missing one. **Rules kept:** password change ends every other session, a password _reset_ ends all of them
(it proves only the inbox, not the device), an email change ends none (it already needs the password and emails the old address).
The current session can't be ended from the list (it would sign the person out of the page they are looking at): that is "Sign out".
"Sign out everywhere else" asks first, because it is a bulk removal, and says how many it ended. Reviewer-only accounts have no account
page and so no list.

## Moving notes and reading items between publications (#193, part of #175)

`POST /api/publications/:id/move/{reading,notes}` takes `to: { ideaId, publicationId? }`. `:id` is where the things are now;
`publicationId` names another publication to move them into, and leaves it out for a move within one.

- **The access rule.** Any member of both publications may move notes and reading items between them (no role is needed on
  either side, as within one publication). A destination the person doesn't belong to is refused with **404 "Not found"**,
  the same answer as for a publication that doesn't exist, so the move can't be used to find out whether one does. The
  destination idea must be one of that publication's. The member middleware on `:id` still protects the source.
- **What crosses.** Everything that "move" keeps within a publication (see _What "move" keeps_ above), including the merge of
  items with the same address, the copy of a note's source and the destination's limits, all checked against the
  destination. The things change `publication_id` as well as `idea_id`, which is why every move updates both. A reading item
  loses its link to a feed (`source_id`) when it leaves the publication that owns the feed; it stays marked as having come
  from a feed. Tags, authors and quotation marks go with them. A note keeps its author, so a name can now appear to members
  of the other publication who weren't in the first; the mover is a member of both, and that is accepted rather than
  hiding the author of someone else's note.
- **Log.** `moves.to_publication_id` (null for a move within a publication) says where it went. `MoveStore.list` returns the
  moves out of a publication and into it, so each log shows both sides. The column cascades on delete, so deleting either
  publication removes the log rows (deleting an account removes its sole-member publications the same way).
- **Undo** is the same move the other way, asked of the publication the things now are in (`to.publicationId` is where they
  came from). It therefore works only while the person is a member of both. Joined items still can't be unpicked.
- **The picker** keeps the common move as quick as it was: it opens on the current publication's ideas and lists. "Another
  publication…" appears last in the same list, only to someone with more than one publication, and asks which, then where in
  it (its own list, one of its ideas, or "A new idea…", made in that publication).

## Moving ideas between publications (#194, part of #175)

On a publication's Ideas page, tick ideas and choose **Move to…** (only for someone with another publication). Picking the
publication asks the server what would happen (`POST /api/publications/:id/move/ideas/preview`, `{ ids, to: { publicationId } }`)
and shows "1 idea, 2 drafts, 5 notes, 3 links will move to “Name”", names the people who will lose sight of them, or says what
is in the way. Confirming does the move (`POST …/move/ideas`) and opens the idea in its new publication (the list, for several).

- **Whole, and as one change.** An idea goes with its drafts, notes, links and brainstorm thread, all or nothing. Only
  `ideas`, `drafts`, `idea_notes` and `idea_links` carry `publication_id`; everything else (comments, snapshots, reviews, critique
  rounds, insertions, handovers, research, messages) hangs off an idea or draft id and follows without being touched, so
  critique limits are not reset and comments keep their authors' names. A single draft can't move without its idea. A reading
  item stops coming from a feed (`source_id` cleared), because feeds belong to the publication they were added to. Ideas are
  listed by last change, so a moved idea counts as just changed and is first in the destination's list. The moves log
  (`moves`) records notes and items, not ideas: the idea's own id is the same before and after.
- **Who may.** The destination must be a publication the person is a **member** of (anything else is 404 "Not found", as for
  notes and items). An idea with **no drafts** can be moved by any member of both; one **with drafts** only by an **owner of
  the source** (403 otherwise).
- **Editors.** Every draft's editor must belong to the destination, otherwise the whole move is refused (409): "Ask <name> to
  join <publication> first, or hand the draft over." The preview reports the same words as `problem` instead of failing.
  An open handover offer or ask involving someone who isn't a member of the destination is closed with the move.
- **Who loses sight of it.** Members of the source who aren't members of the destination can no longer open the idea or its
  drafts. They are not added to the destination and not made reviewers; the confirmation names them. Their past comments stay
  with their names. Reviews opened for a person (a snapshot of the draft) are unaffected, since they point at the draft by id,
  and an open review does not block a move.
- **No trail.** There are no redirects and no history. The old address says an idea "may have been deleted or moved to another
  publication". Reviewer-only accounts have no publications, so the route answers them 404 like every publication route.
