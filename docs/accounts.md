# Accounts and sign-in

Read this when you change sign-in, registration, passwords, publications and their members, invitations, ideas and drafts, account deletion, or the emails the app sends. It is the working specification of the account and publication model (rationale is in [adr/](adr/README.md)); the README has setup and architecture.

- **Model:** a user has any number of _publications_; ideas belong to a publication, and every draft belongs to an idea. Publications are shared by
  adding members (`owner` or `member`; a publication can have several owners, never none: see [Account deletion semantics](adr/accounts-and-security/account-deletion-semantics.md)). Registering does not create a publication: Home opens with a two-step checklist (01 create a publication, 02 connect an AI key) in either order, which disappears once both are done.
- **A publication is a place you publish** (a Substack, a blog, a magazine, a newsletter): each has a name, an optional website, and an
  optional picture (a coloured monogram is drawn when there isn't one). The home page lists them;
  `/publications/new` creates one; `/p/<id>` is its landing page, an overview that opens with its description (clamped, with Show more) then a Quick add panel (new idea, note, something to read), then its newest feed posts, the first items in its articles, its latest notes and its ideas (see _Navigation_ below for its steps);
  `/p/<id>/settings` edits it, shares it and deletes it. A publication also has a **description** (stored as Markdown, up to 5000 characters, but written in a small rich-text editor with bold, italic, lists and links, so nobody needs to know Markdown: what the publication is, who reads it, what kinds of writing go there), which anyone who shares the publication can edit (`PUT /api/publications/:id/description`); the name and website stay the owner's. The writer always writes it themselves: it is the **Description** page in the publication's settings (`/p/<id>/settings/description`, also reached from the publication page's "Describe this publication" step; `/p/<id>/describe` redirects there), a box with a link to a help page (`/help/description`) on what a description needs to say to be useful to your AI. Nothing drafts a description with AI any more (#150).
- **Ideas** (`/p/<id>/ideas/new`; an idea is five steps at `/p/<id>/ideas/<idea>/…`, below): something to write about, which doesn't need an
  external source. An idea has a name ("What's your core idea?"), free-form notes, links to related work (up to
  50; see below), and one or more drafts: one for a single post, several (kept in the order they were
  added) for a linked set of posts. Anyone a publication is shared with can work on its ideas. Deleting an idea
  deletes its links and drafts. API:
  `/api/publications/:id/ideas` (list, create), `/:idea` (get, patch, delete), `/:idea/links`, `/:idea/drafts`.
  **Keep writing** (#310), under Quick add on Home, a publication's landing page and an idea's: `GET /api/drafts/active` answers the drafts the signed-in person edits, in publications they still belong to, that are active (saved in the last 30 days, or with a review in progress, or with comments they haven't resolved), those with unresolved comments first and then newest first. `publicationId` and `ideaId` narrow it; `limit` (3 by default, at most 60) says how many, and `hasMore` tells "Show more" whether to appear. Each draft carries its idea and publication names and, if it was ever sent for review, `review` totals over all its requests (`asked`, `ended`, `unresolved`); not available to reviewer-only accounts. **Quick add** on Home uses the existing create-idea, publication notes and publication reading endpoints.
  **Articles (the idea's links):** the person types only a web address (scheme optional). Text that isn't a plausible
  address is refused ("rubbish" is, "example.org" is not), as is a site whose name doesn't exist, or the same page
  twice (`http`/`https`, `www.`, a trailing slash or `#fragment` don't make a page different). The server looks the
  page's title up and lists the link by it, or by its address when there is none. A link can be edited later (address
  and title; clearing the title looks it up again), and ticked off as read (`PUT /:idea/links/:link/read`, `{read}`); each
  item also records where it came from (`entered`, `brainstorm` or `research`, so AI-suggested pages are visibly marked; `idea_generation` is for later). A note can be
  taken from an item (`POST /:idea/notes` with `readingItemId`: origin `reading`; add `quote: true` for a quotation, which can't be edited and goes into a draft as a blockquote); each item has its own reading page (`/p/:publication/ideas/:idea/reading/:item`) that opens the page in a new tab (a large button, with a Read switch beside it) and holds the Quick add tabs below it: **Add a note** (first; with a **quotation** tick), **Add article** and, on the publication's own item, **New idea**. Each item also has `authors` (names; found on the page with the title, editable via `PATCH …/links/:link` with `authors`). The lookup goes through the `PageInfoFetcher` port
  (`PAGE_FETCHER=http` or `fake`); see [how it avoids reaching private networks](adr/research-and-feeds/related-work-links-fetched-titles-and-why-fetching-user-supplied-addresses.md).
  **Moving articles:** on any articles, **Move items** lets you tick items and choose **Move to** the publication's
  articles, another idea, or (from the publication's list) a new idea named in your own words. The items go with the
  notes taken from them and keep whether they are read; the page says what moved ("Moved 2 items and 5 notes to
  “Rivers”.") with an **Undo**, except when items were joined to ones already there, which can't be unpicked.
  **Moving notes:** on the publication's Notes, or an idea's, **Move notes** lets you tick notes (quotations too; **Select all the
  notes shown** follows the tag being shown) and choose **Move to** another idea, the publication's own notes (from an
  idea), or **a new idea named in your own words**. Before you confirm, the page says how many notes will move and
  that the pages they were taken from are copied to the destination's articles (the originals stay); a tick
  offers to bring the other notes taken from those pages too. Notes are moved, not copied, in the order you arranged
  them, with their tags and quotation marks. **Undo** moves them back (to the end of where they were).
  **Between publications:** someone who belongs to more than one publication also gets **Another publication…** in **Move
  to** (articles and notes alike): choose the publication, then its own list, one of its ideas or a new idea there.
  Any member of both may do it; one who isn't a member of the destination gets "Not found". Everything above carries over
  (items with the same address are joined, a note's source is copied, the limits apply to the destination), and **Undo**
  works while you belong to both (`to: { ideaId, publicationId }` on `POST /api/publications/:id/move/…`).
  **Moving ideas:** on the **Ideas** page, tick ideas and choose **Move to…** a publication of yours (offered only if you have
  another). The page says how many ideas, drafts, notes and links will move and who will lose sight of them, before you confirm.
  An idea moves whole, with its drafts and everything on them; an owner of the publication it is in must do it if it has
  drafts, and each draft's editor must belong to the destination (`POST /api/publications/:id/move/ideas`, with
  `…/ideas/preview` to check first). See [Moving ideas between publications](adr/publications/moving-ideas-between-publications.md).
  **Read items are hidden by default** on every articles (an idea's and the publication's), with a **Show read items**
  tick (and how many are hidden); one marked read during the visit stays in view until the list is shown again, so it
  can be unticked. The choice is for the visit, not saved.
  **Linking to the articles while drafting:** the drawer's Articles inserts a link to an item; if it isn't marked
  read the writer is asked to read it (in a new tab), mark it read, or cancel. Notes taken from an item don't ask.
  **Dragging notes and articles into a draft:** the drafting side bar's notes and articles can be dragged by their rail onto the draft, landing where
  they are dropped (the _Add to draft_ button does the same at the cursor). An article goes in as a link with its authors (“Title by A and B”).
  **The publication's own articles and notes** have their own places: the list of articles is the publication's
  **Read** step (`/p/<id>/read`; the old `/p/<id>/reading` and `/p/<id>/inspiration#reading-list` lead there; each item opens its own reading page at
  `/p/<id>/reading/<item>`) and **Note** is its third step (`/p/<id>/notes`). The idea’s list of articles is separate from the publication's. They are the idea's screens with a different owner (articles, reading page, notes with
  reorder, merge, split, tags and hold-to-delete), and a note says which item it came from. Nothing on them can be
  drafted from: notes go into an idea first (T37d). The API: items and notes can belong to a
  publication as a whole, to be gathered before there is an idea. `GET/POST /api/publications/:id/reading`, `PATCH|DELETE
…/reading/:item`, `PUT …/reading/:item/read` mirror an idea's links (answering with the list), and
  `/api/publications/:id/notes` (with `/order`, `/merge`, `/:note/split`, `/:note/tags`) mirrors an idea's notes, without
  "added to a draft". **Moving:** `POST /api/publications/:id/move/reading` and `…/move/notes`, each `{ids, to: {ideaId}}`
  (`ideaId: null` is the publication itself), answer `{batchId, readingItems, merged, copied, notes}`; all or nothing.
  **Merging and splitting notes:** `POST /api/publications/:id/ideas/:idea/notes/merge` (`{ids}`) joins notes of the same
  origin into the first; `POST …/notes/:note/split` (`{before, after}`) cuts one in two. Both answer with all the notes.
  **Tags on notes:** `PUT /api/publications/:id/ideas/:idea/notes/:note/tags` (`{tags}`) replaces a note's flat tags; the notes
  list and the drafting drawer can show only one tag's notes.
  **Notes while drafting:** the drafting page lists the idea's notes beside the editor (a slide-over on a phone);
  `POST /api/publications/:id/drafts/:draft/insertions` (`{noteId, text}`) records that a note's words were put into the
  draft (origin and source come from the note) and sets the note aside, `GET` lists them, and
  `PUT …/ideas/:idea/notes/:note/added` (`{added}`) puts a note back.
  **Every draft belongs to an idea**: there is no standalone "new draft"; the publication page lists ideas, and drafts
  are added from an idea, and a new draft's title starts as the idea's name unless one is sent (#366). A draft is opened, saved and deleted by id at `/api/publications/:id/drafts/:draft`. Its editor marks it published, with a link to the post or none, at `PUT …/drafts/:draft/published` (`{published, url?}`; only `http:` and `https:` links; no change to the words, so `version` and `updatedAt` stay; unpublishing clears the link; #311). A published draft is left out of Keep writing and carries `publishedAt` and `publishedUrl` in the idea's list of drafts
  (`/p/<id>/drafts/<draft>` in the app), which links back to its idea's Draft step.
  **Each draft has one editor** (#154): the member responsible for its title and body, its creator at first
  (`editorId`, `editorName`). Only the editor can save (`PUT` needs the `version` it was made from; a stale one is
  refused with 409 and never merged, which also covers the same person in two tabs). The page saves by itself about
  two seconds after typing stops (#299; `lib/autosave.ts`), so there is no Save button. The editor can also add notes or links to the
  draft, resolve comments, or ask for a critique (403 before anything is sent or counted). Other
  members read it, with a banner naming the editor, and see changes on reload or when the window regains focus.
  Notes stay open to every member. When
  the editor leaves, is removed or deletes their account, their drafts go to the publication's longest-standing owner.
  **Reviews** (#157, #158): the editor **sends the draft for review** (`POST …/drafts/:draft/send-for-review`,
  `{emails, memberIds}`), which freezes its title and body as a **snapshot**; everyone asked reviews that copy, not later
  edits, and the dialog says so (sending again makes a new copy). People by email get a 7-day link (`/review-invite`)
  bound to that address, with the same quiet `202`, throttles and blocks as publication invitations; a new person makes a
  **reviewer-only account** with just a name and password (no username, no publication) and lands on the review itself, and every route outside
  `/reviews/*` (plus `/auth/me`, sign-out, accepting an invitation and deleting the account) answers 404. Members of the
  publication can be asked directly and find the review on their home page. A review is _open_, _ended_ (the reviewer
  pressed **End review**: the editor is emailed once, "X has finished reviewing Y and left N comments") or _closed_
  (the editor or an owner stopped accepting, `DELETE …/reviewers/:review` or `POST …/reviewers/close`); the last two are
  read-only but still show the snapshot and the reviewer's own comments. The editor sees each reviewer's state and comment
  count (`GET …/reviewers`, with each review request's progress: who has finished, of those reading, finished or yet to answer, and its comments) in a Reviews tab beside the draft, one request at a time. A request can be named (`PATCH …/snapshots/:id`, up to 80 characters; blank clears it) and its open reviews closed together (`POST …/snapshots/:id/close`). They also see their comments, placed on the live draft where the passage still exists. **Start writing**
  (`POST /reviews/start-writing`) or an invitation to a publication makes a reviewer-only account a full one.
  **What is waiting on you** (#159): `GET /api/publications/:id/attention` feeds a block at the top of the publication's landing
  page: a draft offered to you (Accept / Decline there) and your own offer still waiting (Withdraw). How the reviews of your
  drafts stand is in Keep writing (#310). Nothing is shown when nothing waits, and nothing is emailed or counted elsewhere.
  **Handover** (#155), on the draft page itself (what waits for an answer, and what you have set going, are notices at the top; **Offer draft**, **Ask for this draft** (with a confirm), **Reassign draft**, **Send for review** and the history are buttons opening dialogs, #296; who is reviewing is a Reviews tab beside the draft, #301) (`/api/publications/:id/drafts/:draft/handover`): the editor **offers** the
  draft to a named member (`POST …/offer`, one open offer per draft); they stay editor, and can keep writing, until the
  member **accepts** (`…/offer/accept`) or **declines**; the editor can **withdraw** (`DELETE …/offer`). Any other
  member can **ask** (`POST …/asks`), which only shows the editor a request to offer or set aside. An owner can
  **reassign** (`POST …/reassign`) without the editor. Only an offer sends an email (to the offered member, with a link
  to the draft; 20 a day per editor); nothing else does. Everything is kept as a history, showing "Reassigned by Jo"
  and the like, and "Passed to Ada when the previous editor left" for the system's own moves; names follow the
  keep-my-name choice at account deletion. Leaving, removal and account deletion
  also close what the person had open before their drafts pass to an owner.
  **Comments** (#156): any member can comment on any draft, about one paragraph or the whole draft
  (`POST …/drafts/:draft/comments`, `{block, text}`; the server finds the paragraph and keeps its hash and start). The
  AI's critique points are the same kind of comment (`byAi`). `GET …/comments` is independent review: the editor gets
  every comment, resolved ones included, each with its author; everyone else gets only their own open ones
  (`visibleComments` in `services/comments.ts` is the one place that decides, and the critique route likewise tells
  non-editors nothing, not even how many looks are used). Only the editor resolves (`PUT …/comments/:id`,
  `{resolved}`): the comment is hidden, never deleted, and the editor can show it again. A comment carries words about
  the writing and no replacement text, has no cap, does not count against the critique looks, and is never sent to the AI.
  A commenter's name stays after they leave the publication, and after they delete their account if they chose to keep it.
- **Handles and publication ids:** every user has a unique `handle` (letters and digits only), shown to people as their
  _username_. They choose it when they sign up, and the form checks it against everyone else's as they
  type (`GET /api/auth/handle-available`; the server checks again on submit). Sign-ups through an external
  identity provider have no form to choose it on, so they get one derived from their name, e.g. `jenit`, and the
  landing page asks once whether they'd like another or want to keep it. Anyone can change theirs on the Your details page
  (`PUT /api/account/handle`, up to 5 changes a day). Publications already created keep their address; new ones use the
  new username. The old one is kept for its owner: nobody else can take it, but they can switch back. A few names
  that look like the service itself (`admin`, `support`...) are reserved. A publication's id is `<creator's handle>-<slug of its name>`, such as
  `jenit-substack`; if that's taken by the same person a number is added (`jenit-substack-2`). Renaming a
  publication renames its id too; the old id permanently redirects to the new one, so shared links keep working. Two people can each have a
  `substack` because their handles differ.
- **Sign-up and first steps:** the form asks "What should we call you?" (`autocomplete="given-name"`, so
  browsers fill in a first name rather than a full one), a username, an email and a password. The landing
  page shows step-by-step instructions for getting an Anthropic API key, with a field to paste it into, until
  a key is saved (new users have to do this before the AI features work); a new user with no publication is also
  prompted to create one.
- **Your name:** the name from sign-up is what other people see on notes, brainstorm messages, member lists and
  invitations. It can be changed on the Your details page (`PUT /api/account/name`) and changes everywhere at once, since
  nothing stores a copy; emails already sent keep the old one.
- **Publication pictures:** PNG, JPEG, WebP or GIF, up to 1 MB, stored in the database and served from
  `/api/publications/:id/image` to members only. The type is decided by the file's bytes (not what the browser
  claims); SVG is refused because it can carry script. The browser first shrinks a PNG, JPEG or WebP over 1 MB or
  512px on its longest side (so a phone photo works as it is); GIFs are not touched, and the server's limits don't change. Each person can own up to 25 publications.
- **Feeds**: each publication keeps a list of RSS/Atom feeds (up to 50), managed on the **Feeds** page of the publication's
  settings (`/p/<id>/settings/feeds`) by any member: paste a feed link, or the address of a site that has one, and the server reads
  it to show the feed's title, description and picture (the site's icon, else the feed's own logo, which is often too wide to read at icon size). They are listed alphabetically
  (there is no order to keep); remove one. **Scan** (`/p/<id>/scan`; the old `/p/<id>/search` and `/p/<id>/inspiration` lead there) shows their
  posts, and offers "Set up feeds →" while there are none and "Manage feeds" after. Addresses are tidied (https assumed,
  `#fragment` dropped) and duplicates refused. A person can add 30 sources an hour, since each one makes the
  server fetch pages. The fetch refuses private-network addresses and bounds time (10 s) and size (3 MB).
  At the top of the Scan page, **Recent posts** is one list of the newest posts from all the feeds, newest
  first, each with its feed's logo and name, for the last week, month (the default), 3 months or year: so a blog that
  posts twice a year doesn't clutter it. It shows five posts at a time (Previous / Next above and below the list; the bottom ones scroll back to the top) out of at most 100, counts posts that carry no date (they can't be
  placed in time), names feeds it couldn't read, and has a "Check for new posts" button.
  Each post has **Add** and **Ignore** (as in the research review): Add puts it in the publication's articles
  (marked "From a feed"; `POST …/sources/recent/add`, `…/ignore`, `…/reconsider`, each `{posts: [{sourceId, postId}]}`);
  an ignored post stays in the list, marked, and **Reconsider** takes either back. A post that has been added or
  ignored moves to the **end** of the list (the latest decision last), so the posts still waiting stay together at
  the top, in date order. A post is "on a list of articles" if it
  is on any of the publication's lists, however it got there. The list of articles is on the same page, below the posts. **The publication's own list of articles has no maximum** (an idea's keeps 50), but an item
  that isn't ticked **Keep** is dropped, silently, a month after it was put on that list (`PUT
/api/publications/:id/reading/:item/kept` `{kept}`); one that notes were taken from is never dropped, and moving an
  item onto the publication starts its month again.
  The posts are the latest as each feed lists them (title,
  link, authors, date, and a short plain-text start of the summary; never the article). The server keeps each read for 3
  hours, asks again with `ETag`/`If-Modified-Since` so an unchanged feed costs little, leaves a feed that failed
  alone for 30 minutes, and shows when it last worked and why it stopped. Reads are capped at 120 an hour per person.
  Nothing yet turns these posts into ideas; that is the "Add article" page (T6c).
  If a pasted website offers several feeds, the person is shown them (posts first, feeds of comments last and
  labelled, at most 10) and ticks which to add; `POST` then answers `200 {choices}` instead of `201`.
  API: `GET/POST /api/publications/:id/sources`, `GET .../sources/:sourceId/icon`, `GET .../sources/recent[?days=30&refresh=true]`, `GET .../sources/:sourceId/items[?refresh=true]` (one feed's posts; the app no longer shows them per feed),
  `DELETE .../sources/:sourceId`. `FAKE_FEEDS=true` (development/e2e only) makes every
  `*.example` address a feed instead of using the network.
- **Sessions:** random token in an `HttpOnly`, `SameSite=Lax` cookie; only its SHA-256 is stored
  server-side. 30-day expiry. Cross-origin writes are rejected by an `Origin` check.
- **Devices** (Sign-in and security page, #165): each session keeps a
  coarse label from the User-Agent ("Safari on macOS", else "Unknown device"; picked from a fixed list of words, so
  nothing the browser sends is stored or shown back) and when it was last used (rewritten at most once an hour).
  **No IP address, no location, no raw User-Agent.** Each is named on the page by its own random id, never the cookie or
  its hash. API (all need sign-in, and reviewer-only accounts get 404 as for the rest of the page):
  `GET /api/account/sessions` (the one asking has `current: true`), `DELETE /api/account/sessions/:id` (another
  device; your current session is refused with 400, a stranger's id is 404), `DELETE /api/account/sessions` (every
  session but this one; answers `{ count }`). Changing or resetting a password ends the others (a reset ends all);
  changing the email address does not.
- **Passwords:** scrypt (`node:crypto`), 8-128 characters. Reset links are single-use, expire after
  an hour, and signing in elsewhere is revoked when a password changes. Responses never reveal whether
  an address has an account (except at registration, which has to say so), and that includes
  inviting someone to a publication.
- **Changing your password** (Sign-in and security page) needs the current one, signs out every _other_ device, cancels any
  reset link already out, and emails a "your password was changed" notice with a link to reset if it wasn't
  you. Google-only accounts can **add** a password: instead of typing one on the page, they're emailed a link
  (the reset flow), so a hijacked session alone can't add a password and keep access.
- **Changing your email** (Your details page) needs the password. We email a link to the _new_ address and switch
  only when it's opened (24 hours, newest request wins), so a typo can't lock anyone out. The new address
  counts as confirmed, the old one gets a "your email was changed" notice, and confirmation links, reset links
  and invitations addressed to the old address stop working. Changing or resetting the password cancels a
  pending change. Accounts with no password (Google-only) add one first. The notice to the old address has a
  **"this wasn't me"** link (7 days, while the account still has the address it moved to): on a button press it
  restores the old address, signs out every device and emails a password-reset link there.
- **Login with Google:** OpenID Connect code flow with PKCE, state and nonce, ID-token signature
  verified with `jose`. Set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and register
  `${PUBLIC_URL}/api/auth/oauth/google/callback` as the redirect URI. Other OIDC providers are a few
  lines of config (`OidcProvider`); others implement `IdentityProvider`.
- **Private alpha: accounts are approved by the owner** (#328). `ACCOUNT_APPROVAL=required` (the default; `open` approves
  everyone at once, for development and the e2e tests) makes every new account `waiting`, whether it came from the email
  form or Google. A `waiting` or `declined` account can reach only: `GET /auth/me`, sign-out, resending the confirmation
  email, `DELETE /account`, `GET /account/export`, adding a password (which deleting needs when you signed in with
  Google), and accepting an invitation; `requireUser` answers 403 to everything else, so there is no app and no AI call
  (`unapprovedMayReach` in `auth/middleware.ts`, the sibling of `reviewerMayReach`). The web app sends such an account to
  `/waiting` ("we'll email you"); a declined one sees a brief, kind note with no reason. **An invitation from an approved
  person is approval:** a reviewer made by following a review link starts `approved` if the inviter is, and a `waiting`
  account that accepts a publication or review invitation from an approved person becomes `approved` (a `declined` one
  stays declined: the owner has decided). Existing accounts were made `approved` by the migration.
  **Admin:** `users.is_admin` is set only from `ADMIN_EMAILS` (comma-separated; applied when that confirmed address next
  uses the app, and the account is approved at the same time; a first sign-up with such an address is approved at once through Google, or as soon as the confirmation link is opened (even signed out) for the email form, and neither is held up by the sign-up allowance. An unconfirmed account with that address stays waiting, so knowing the owner's address is not a way in) or the command
  `pnpm --filter @wordwright/api admin grant|revoke <email>`; no route sets it, a changed email address clears it, and
  every admin check also needs a confirmed address. `/admin` (API: `GET /api/admin/accounts`,
  `POST /api/admin/accounts/:id/decision`; web: "Accounts" in the menu foot, admins only) answers 404 to everyone else.
  It lists those waiting, then everyone, with name, email, signup date and status, and never drafts, ideas, keys or notes.
  Approve and decline email the person (`approvedEmail` with a sign-in link, `declinedEmail` with no reason) and write
  `admin_audit` (admin, action, person, time: ids only, so the log survives either account going, with the person
  unlinked). A repeated decision changes nothing and sends nothing; an admin cannot decide about themselves or another
  admin. Sign-ups are throttled (`SIGNUPS_PER_HOUR`, 30 an hour, one bucket shared by the email form and Google, which counts only a sign-in that would make a new account) and decisions (120 an hour per admin). Not built: an
  email to the owner when someone is waiting (the issue's optional item); the list is the queue.
- **Sharing is by invitation.** An owner (with a confirmed address) enters an email; we send a link valid
  for 7 days that works whether or not the person has an account yet. The invitee signs in or signs up with
  _that_ address (a new person is joined as soon as they have; someone already signed in sees a Join button, and the
  sign-in link carries `join=1` so the page knows which). Nobody is ever added without opening the link, the owner's reply is identical
  whether or not the address has an account or is already in (so it can't be used to look people up), and
  accepting from the emailed link also confirms the invitee's address. Someone whose address is already confirmed also
  sees their pending invitations on Home (`GET /invitations/mine`, then `POST /invitations/mine/:id/accept` or
  `/decline`), so they needn't find the email; an unconfirmed account gets the same empty list as one with nothing
  waiting, because a typed-in address does not prove the inbox. Owners see pending invitations and can
  resend or revoke them, and make members owners (or remove other owners, or step down) from the people list on
  the publication's Sharing page (the page says what members and owners can do behind info icons beside the People and Invitations headings, from the wording in
  `apps/web/src/lib/publication-roles.ts`; invitees always join as members; every row of both lists is the shared `RowList`); each person can send 20 a day since every one emails a stranger, and any one address
  receives at most 5 a day from everyone together.
- **Declining and blocking invitations:** every invitation email links to a page where the invitee (signed in or
  not) can decline and, optionally, stop invitations from that sender or from everyone. The sender is never
  told: a declined invitation just stops being pending, and later invitations from a blocked sender (or any
  invitation to an address that blocks everyone) are dropped with the same reply as always. Confirmed accounts
  see and lift their blocks under "Invitations" on the Sign-in and security page; blocks follow the person if they
  change their email.
- **Email confirmation:** new local accounts are _unconfirmed_; signup emails a link (valid 24 hours, newest
  link only, harmless to open twice). Unconfirmed people can write and use AI features, but **can't invite
  others**. A banner offers "Resend" (3 per hour). Confirmation also happens when someone signs in with
  Google, resets their password via the emailed link, or accepts an invitation sent to that address, since
  each proves ownership of it.
- **Abandoned signups are cleaned up.** Every 6 hours the server deletes accounts that never confirmed their
  email, are older than `UNCONFIRMED_ACCOUNT_TTL_DAYS` (default 14; 0 turns it off) and show no sign of use:
  no drafts or ideas, no saved API key, nobody else in their publications. That frees addresses taken by typos. The signup
  email says so, and one reminder (with a fresh confirmation link) is sent 3 days before deletion. The same pass removes expired sessions, used/expired links and old invitations. It logs
  counts only, never who.
- **Exporting your writing** (#167): the Download your writing page (all your publications, `GET /api/account/export`) and each publication's
  settings (`GET /api/publications/:id/export`) download a zip of Markdown only: a README, then per publication a file for the
  publication, one per idea (notes, articles, links to drafts) and one per draft. Owners get every draft, members
  the drafts they edit or started; notes and articles are everyone's, with names. Comments, reviews, brainstorm
  chats, API keys and email addresses are never included. Built on request, throttled to 5 an hour per person; see
  [Exporting your writing](adr/drafts-and-editing/exporting-your-writing-markdown-only-by-role-built-on.md).
- **Deleting an account** needs the account's password (`password` in `DELETE /api/account`; a wrong or missing one
  answers 403). An account that signs in only with Google must add a password first, as changing an email does, and the
  request answers 4xx saying so. It removes the user, credentials, sessions and memberships, and every publication
  (with its drafts) where they are the only member. In shared publications they are removed and drafts they wrote
  there stay; the only owner of a shared publication must first make someone else an owner (or delete the publication),
  and the request answers 409 until they do. The page asks
  whether to **keep their name** on their notes, brainstorming messages, research runs and draft insertions in
  publications that continue (the default; `keepName` in `DELETE /api/account`) or show them as "a former member".
  Only the display name is copied (into `kept_name` columns, at deletion; never the email or username), and
  choosing not to leaves no trace of it on any row. Leaving or being removed from a publication keeps the name anyway.
- **Email:** see below.

## Email

Emails (password reset, address confirmation, invitations) go through the `Mailer` port, chosen by `MAIL_TRANSPORT`:

| Transport           | Use                                 | Setup                                                                                                    |
| ------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `console` (default) | local development                   | none: the email, link included, is printed in the `apps/api` output                                      |
| `file`              | e2e tests, or reading mail as files | `MAIL_OUTBOX_DIR` (each email becomes a JSON file)                                                       |
| `smtp`              | production                          | `SMTP_URL` + `MAIL_FROM`; works with any provider that offers SMTP (Resend, Postmark, SES, Mailgun, ...) |

To see real-looking mail locally without sending anything, run a catcher such as
[Mailpit](https://mailpit.axllent.org/) and set `MAIL_TRANSPORT=smtp SMTP_URL=smtp://localhost:1025`.
Production refuses to start unless it's `smtp` with a `MAIL_FROM`. At startup the API checks it can reach
the SMTP server and logs a warning if not. Emails are sent _after_ the response, so the forgot-password
answer is the same, and just as fast, whether or not the address has an account; delivery failures are
logged (user id and error code only, never the link).
