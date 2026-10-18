# Wordwright

A web app that supports a writer's journey from idea to published writing, with AI that helps them judge their own words and never writes them. This file is the glossary; rationale lives in `docs/decisions.md` and `docs/adr/`.

## Language

### People and access

**Publication**:
A place where the writer publishes: a Substack, a blog, a magazine, a newsletter or similar. It holds ideas and drafts, with people who work in it.
_Avoid_: Profile, venue, workspace, account

**Idea**:
The writer's one-sentence statement of what they want to write about. Its name is the core idea, in their own words; it holds the idea's own notes, reading items, brainstorming and drafts, and belongs to a publication.
_Avoid_: Topic, title (that is a draft's), subject

**Description**:
The writer's own account of a publication: what it is, who reads it and what kinds of writing go there. Shown at the top of the publication and given to your AI so it knows what the writing is for. Optional, and written by the people who work in the publication.
_Avoid_: Bio, about, brief

**Feed**:
An RSS or Atom link that a publication looks through for recent posts, which the writer can add to the reading list. Any member can add or remove them, in the publication's settings; they are listed alphabetically, with no order of priority.
_Avoid_: Source (in what people see), subscription

**Reading list**:
The publication's own list of reading items, from which notes are taken. Posts from its feeds are added to it; ideas have their own.
_Avoid_: Library, bookmarks

**Note**:
A piece of the writer's thinking kept for later: their own words, or words from a reading item. It belongs to an idea, or to the publication before there is one, and can be tagged, moved and put into a draft.
_Avoid_: Snippet, highlight

**Quotation**:
A note marked as someone else's exact words. It is kept word for word, so it cannot be edited, and goes into a draft as a quotation with a link to its reading item. Pasting into an empty note ticks it, and says so.
_Avoid_: Direct quote, quote (in what people see)

**Reading item**:
One post or article on a reading list, shown by its title, with whether it has been read and its tags. Its title opens its own page, where notes are taken from it; the host name beneath the title opens the article itself. On the publication's list it is also _kept_ (stays on the list for ever) or not (it goes a month after it was added); items the writer adds are kept from the start. Notes taken from it mark it read. The action of putting one on the list is called “Add to reading list” wherever it appears.
_Avoid_: Link, source, bookmark, Add item, Add something to read (in what people see)

**Publication picture**:
The image an owner chooses for a publication. Always shown in preference to the site icon.
_Avoid_: Avatar, logo

**Site icon**:
The icon of a publication's website, fetched once when the website is set or changed and shown, as a guest image, only when the publication has no picture of its own. It sits contained on a plate, unless it is square to its corners (as wide as it is tall, at least 64px, all four corners opaque, sampled just inside the edge), when it fills the picture's box. A feed's icon follows the same rule.
_Avoid_: Favicon, logo

**Mark**:
The Wordwright product's own symbol: a flame whose tip is a split pen nib. It names the product only, so it is never shown for a publication and never stands in for a Publication picture or Site icon.
_Avoid_: Logo, favicon (the browser-tab copy is still just "the mark"), Wordwright icon

**Owner**:
A person who administers a publication (invites and removes people, makes other members owners, reassigns drafts). A publication can have several owners but never none.
_Avoid_: Admin

**Member**:
A person who works in a publication. An owner is also a member._Avoid_: Collaborator, user, publication editor

**Invitation**:
An emailed offer, addressed to an email address, to join a publication as a member. Accepted from the link in the email or, once signed in with that address, from Home.
_Avoid_: Invite (in text people read)

**Reviewer**:
A person invited by email to read and comment on a draft, without being a member of its publication. Has a reviewer-only account, which can be upgraded to a full one.
_Avoid_: Guest, commenter, viewer

### Drafts and responsibility

**Draft**:
One piece of writing belonging to an idea; the thing that gets published.

**Editor** (of a draft):
The one member currently responsible for changing a draft's title and body and for publishing it. Everyone else can read and comment.
_Avoid_: Holder, author, lock, assignee

**Handover**:
The explicit transfer of a draft's editor role: the editor offers the draft to a named member, who accepts it. Until accepted the offerer stays editor. A member can ask for the draft, which only prompts the editor.
_Avoid_: Transfer, claim

**Reassignment**:
An owner moving a draft's editor role to another member without the current editor's involvement, for when the editor is absent or gone.

### Review

**Comment**:
A remark about a paragraph or the whole draft, from a person or from the AI, that the editor decides what to do with. Never carries replacement text.
_Avoid_: Suggestion, feedback item, point (the AI's critique "points" are comments)

**Resolved** (comment):
Set aside by the draft's editor as dealt with: hidden, never deleted, for everyone.
_Avoid_: Dismissed, read (the earlier names)

**Critique**:
A rationed AI review of a draft that produces ranked comments. Only the draft's editor can ask for one.

**Snapshot**:
A frozen copy of a draft's title and body, made when the editor sends the draft for review. Reviewers read and comment on the snapshot, not the live draft, so their comments are about words they actually saw.
_Avoid_: Version, revision, copy

**Review**:
One reviewer's engagement with one snapshot. It is _open_ (they can comment), _ended_ (they finished it) or _closed_ (the editor stopped accepting comments); the last two are read-only but still show the snapshot and the reviewer's own comments.
_Avoid_: Round (that means a critique round)

**Independent review**:
A reviewer or non-editor member sees only the draft and their own comments, never anyone else's, human or AI. Only the editor sees them all and decides how to resolve disagreements.

### Home

**Quick add**:
The tabbed small forms for adding a new idea, a note or something to read without first opening the place it goes. On a writer's landing page they add to the chosen publication's own list, never inside an idea; on a publication's landing page, to that publication; on an idea's, a note or reading item to that idea (there is no New idea tab). On a reading item's own page they take a note from that item (first tab), add another reading item, or (on a publication's item only) start an idea.
_Avoid_: Capture, inbox (that word is the issue tracker's)

**Pick up**:
The short list on a writer's landing page of the drafts they are the editor of, newest first, each with a link to carry on writing it. Not the drafts they are only asked to review.
_Avoid_: Recent, continue (that is the link's label), in progress

**Move**:
Taking notes, reading items or whole ideas from where they are to another place: another idea, a publication's own list, or (rarely) another publication the person belongs to. An idea moves with all its drafts, notes and links, and the people who could see it only through its old publication stop seeing it.
_Avoid_: Transfer, copy (a moved note's source reading item is copied, but the note itself is moved)

### Rephrasing

**Rephrase**:
The action of asking for options for a passage of a draft (up to one paragraph) or for its title, which the writer has selected because they are struggling with it.

**Aim**:
What the writer says a passage or title should do, in their own words, stated before any options are offered. Changing it is what allows another round.
_Avoid_: Prompt, instruction, brief

**Option**:
One of a set of different approaches the AI offers to a passage or title. None is used until the writer has picked it, can edit it, and presses "Use this".
_Avoid_: Suggestion (that implies replacement text pushed at the writer), proposal (brainstorm's word for things the writer accepts), alternative

### Explaining

**Tutorial mode**:
A setting on a person's account that shows the explanations otherwise kept behind info icons (and short page-purpose lines that appear nowhere else) written out on the page. On for new accounts, off for others, switchable at any time. It never holds anything a person needs to avoid a mistake.
_Avoid_: Onboarding, walkthrough, help mode
