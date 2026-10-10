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
get a generated one, and are asked once whether to keep it (`users.handle_chosen`). They can be changed later (T18,
below); the migration also rewrote old UUID ids to this form. Alternatives rejected: per-user
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
"Unused" means no drafts, no saved API key and no other people in their profiles, so nobody who has started
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
standalone create and list routes are gone, and the profile page lists ideas. `drafts.idea_id` is still nullable
in the schema because SQLite can't add NOT NULL afterwards; the store always sets it and the API schema requires
it. An idea's drafts are listed with it in an order the person sets, which is also the reading order for a linked
set of posts (T20e). New drafts go last; `drafts.position` holds the order and `PUT .../ideas/:id/drafts/order`
changes it the same way as idea sources (the complete list of ids, refused with a 409 unless it names exactly the
idea's drafts), and counts as a change to the idea. Deleting an idea deletes its drafts, which the page says before it asks for confirmation.
Links are plain web addresses (http/https only, with `https://` assumed when someone types `example.org`); the
field is a text input, because `type="url"` makes the browser refuse that. Having an idea counts as "using" an
account, so the unconfirmed-account cleanup never deletes someone's ideas. Renaming a profile rewrites its id in
every table that points at it; `ideas` was missing from that list at first, which broke renaming any profile
that had one, so the rename test now creates an idea.

## Notes are separate cards, with an origin (T28)

An idea's notes used to be one text column. They are now rows in `idea_notes` (text, origin, author, position,
`added_at`), arranged by the person and changed through `/ideas/:id/notes` (add, edit, delete, and reorder by
sending the whole list of ids, with a 409 if it is stale, as for feed sources; at most 200 per idea).
`origin` is `entered`, `brainstorm` or `reading`; notes made through the API are always `entered`, and later
tasks set the others on the server. `added_at` is for the drafting drawer (T33) and has no route yet.

- **`profile_id` always, `idea_id` nullable.** A note can later belong to a profile before it has an idea
  (starting an idea from notes, T37), so the table does not assume an idea. `profile_id` is in the profile-rename list.
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

- **Cards or list.** The same `ReorderableList` serves both, with a `layout="cards"` option: separate bordered
  cards, two across where there is room, with the drop marker on the left or right of a card when they are side by
  side. A card's buttons wrap under its text so the text keeps its width on a phone. The choice is remembered in
  `localStorage` (this browser only; losing it just means the default, cards).
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

A note's origin label names the person: "Added by Ada", "From brainstorming with Ada", "From reading, by Ada". It is
a trusted space (the owner's call), and in a shared profile "added by hand" wouldn't say whose hand. `IdeaNote.authorName`
is joined from `users` when notes are read, so it is always the person's current name; it is null once their
account is gone (the note stays, `created_by` is set null), and the label then says "a former member". For a note
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
messages, in a profile's list of people, and in invitations. It can be changed on the Account page
(`PUT /api/account/name`, validated by the same `NameSchema` as sign-up and profile names: trimmed, 1 to 100
characters). **Nothing keeps a copy**, so a change shows everywhere at once with no migration: note authors, thread
messages, members and a waiting invitation's sender are all read from `users.name` when shown, and tests prove it
for each. The old name is not kept anywhere on purpose. There are two copies that cannot follow a change: emails
already sent (they say the old name, and the form says so), and the in-memory "X is waiting for a reply" lock during
a brainstorm reply in flight, which lasts at most the reply timeout. Unlike a username it has no effect on any
address, so there is no list of retired names and no daily cap, only the light per-person throttle other account
changes share. Names are not unique, as before.

## An idea's links are its reading list, and can be marked read (T31)

What the idea page called "Related work" is now the idea's **Reading list**, and the profile's RSS feeds are
**Reading list sources**: the two are still separate tables and routes (an idea's items are links someone chose; the
profile's sources are feeds that will later fill a profile-level list, T37). The code keeps its old names (`idea_links`, `IdeaLink`, `ProfileSources`): renaming them is churn for no gain.

- **Read is the writer's say-so.** Each item has `read_at` (null until marked), set by a plain checkbox, because the
  app can't know that a page was read, and people read things offline. Marking read twice keeps the first date;
  unticking clears it. The checkbox is the whole mechanism; the friction before citing an unread item is T34.
- **Origin.** Each item records `origin`: `entered` (the writer, and everything so far), `brainstorm`, `research` or
  `idea_generation`, so items an AI suggested are visibly marked ("Suggested in brainstorming", "Found by
  research"), per [responsible-ai.md](responsible-ai.md) principle 5. Nothing but `entered` is produced yet; T38 and
  T37 will. The database refuses any other value.
- **Notes from reading.** `POST …/notes` takes an optional `readingItemId` (it must be on the same idea). Such a
  note has origin `reading` and says which item it came from ("From reading “Title”, by Ada"). Removing the item
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
`reading`, names the item in its origin line ("From reading “Title”, by Ada") and appears among the idea's notes too.

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
  grows instead of being pushed off the screen.
- **Profile level.** Only an idea has a reading list so far (the profile's feeds are sources, not items), so this page
  is for an idea's items. A profile-level list (T37) would reuse the page.

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
  someone else's words, so it says whose. The note says "Quoted while reading “Title”, by Ada" and is set apart as a
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

## Idea sources: an ordered list of feeds, edited by any member

Idea generation will scan RSS feeds, so each profile holds a list of feed URLs (D2: RSS first). Order is the
priority later used to rank posts, so it is stored as a dense `position` and changed by sending the whole list of
ids (`PUT .../sources/order`) rather than "move X to N": the server refuses (409) unless the ids are exactly the
profile's current sources, so a stale screen can't drop or resurrect a feed, and drag, buttons and two editors
all use the one operation. The UI offers drag and drop (HTML5, grip handle, whole-row drag image, a line shows
where it will land) and, as the keyboard and touch route, up/down buttons; native drag and drop does not work on
most touch screens, and a library for it wasn't worth a dependency. That interaction lives in one component,
`ReorderableList` (also used for an idea's drafts), so every list people can reorder looks and behaves alike: it
works out the new order and the page's `save` stores it. Like drafts, the list is shared working
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
the title, or the reason it was refused, straight away. Not done: a per-site politeness delay or caching.
The profile's own website field (`SiteUrlSchema`) applies the same `WebAddressSchema` check, with a 300-character
cap. It is checked only when saved, so a site stored earlier that wouldn't pass still displays, but must be
corrected or cleared the next time the profile settings are saved.

## Brainstorming proposes; it never edits, and it never drafts

The brainstorm conversation (design in [brainstorming.md](brainstorming.md)) lets the person's LLM suggest a new
title or notes for an idea, or a new idea, as **proposals the person accepts**; nothing is written otherwise. That
is both the owner's rule that the author's voice and decisions stay theirs and the main defence against prompt
injection (idea notes and fetched page titles go into the prompt): the model has no way to change, fetch or send
anything. It deliberately cannot touch drafts, and draft bodies are not sent to it. One thread per idea is shared
by all members of the profile; each message is sent with its sender's own key, model and prompt, so the thread is
stored in our own neutral format (text and tool calls, no provider "thinking" blocks) to replay across providers.
The default prompt makes the model a sceptical commissioning editor and lives in code; each user can edit their
own copy on the account page.

## Prompts are Markdown files in a top-level folder; `chat()` extends the LLM port

The AI's instructions are prose the owner wants to read and change, so they live in `prompts/` as plain `.md`
files (one per prompt, the whole file is the prompt, with a README saying what each is) rather than inside TypeScript
strings or config. They are read at startup by a small `@lfwa/prompts` workspace package, and the evals read the
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
description. The guarantees are the structural tests (below), which are deterministic and free. The harness (`evals/`, `@lfwa/evals`) is built so that what is tested is what is
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
  could name a draft, an id or a profile, if a planted field survives validation, if a draft could carry text into the
  snapshot, or if the person's prompt could displace the app's rules. Adding to a tool is allowed, but must be a
  decision: the allowed-inputs list in the test has to be edited with it.
- **Adapters.** Looking at a new LLM adapter now includes the contract suite (which must pass) and a run of
  `pnpm eval:adapter` with a few trials, with the summary pasted in the issue. The eval results are information for the
  owner, who decides: a case a weaker model fails is not an automatic veto, and a pass is not a guarantee.
- **Limits.** The cases were written without running them against a real model, so the first run may show a rubric
  that is too strict or too loose; tune the case, and say so in the commit. LLM-graded rubrics can flake: rerun a
  failure before believing it. The critique case calls `complete()` as the route does, so it does not use `chat()`.
