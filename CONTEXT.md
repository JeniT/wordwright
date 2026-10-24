# Wordwright

A web app that supports a writer's journey from idea to published writing, with AI that helps them judge their own words and never writes them. This file is the glossary; rationale lives in `docs/adr/`.

## Language

### People and access

**Publication**:
A place where the writer publishes: a Substack, a blog, a magazine, a newsletter or similar. It holds ideas and drafts, with people who work in it.
_Avoid_: Profile, venue, workspace, account

**Idea**:
The writer's one-sentence statement of what they want to write about. Its name is the core idea, in their own words; it holds the idea's own notes, articles, Refine conversations and drafts, and belongs to a publication.
_Avoid_: Topic, title (that is a draft's), subject

**Description**:
The writer's own account of a publication: what it is, who reads it and what kinds of writing go there. Shown at the top of the publication and given to your AI so it knows what the writing is for. Optional, and written by the people who work in the publication.
_Avoid_: Bio, about, brief

**Feed**:
An RSS or Atom link that a publication looks through for recent posts, which the writer can add to its list of articles. Any member can add or remove them, in the publication's settings; they are listed alphabetically, with no order of priority.
_Avoid_: Source (in what people see), subscription

**Articles**:
The publication's own list of articles, from which notes are taken. Posts from its feeds are added to it; ideas have their own.
_Avoid_: Library, bookmarks

**Note**:
A piece of the writer's thinking kept for later: their own words, or words from an article. It belongs to an idea, or to the publication before there is one, and can be tagged, moved and put into a draft.
A note that began as a suggestion in a Refine conversation is described as “From conversation with your AI” to the person it is credited to (whose message prompted it, or who last edited it) and “… their AI” to anyone else.
_Avoid_: Snippet, highlight

**Quotation**:
A note marked as someone else's exact words. It is kept word for word, so it cannot be edited, and goes into a draft as a quotation with a link to its article. Pasting into an empty note ticks it, and says so.
_Avoid_: Direct quote, quote (in what people see)

**Article**:
One post, video, podcast or other piece to read, watch or listen to, on a list of articles, shown by its title, with whether it has been read and its tags. Its title opens its own page, where notes are taken from it; the host name beneath the title opens it. On the publication's list it is also _kept_ (stays on the list for ever) or not (it goes a month after it was added); items the writer adds are kept from the start. Notes taken from it mark it read. The action of putting one on the list is called “Add article” wherever it appears. (Whatever its form, it is an article; “reading” was dropped because not everything is read.)
_Avoid_: Reading item, reading list item, link, bookmark, Add item, Add something to read, source (that is the website it came from) (in what people see)

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
A person who administers a publication (invites and removes people, makes other members owners, reassigns drafts). A publication can have several owners but never none. Not the same as the site's admin.
_Avoid_: Admin

**Approved**:
An account the site's owner has let in. Only an approved account reaches the app; an invitation from an approved person also lets someone in. Every account that existed when approval began is approved.
_Avoid_: Verified (that is about the email address), activated, whitelisted

**Waiting**:
An account that has signed up and is waiting for approval. It sees one page saying we will email when it is approved, and can sign out, download what it has or delete itself. A **declined** account is one the owner has chosen not to let in; it sees a brief, kind note with no reason.
_Avoid_: Pending, unapproved, banned, rejected (in what people see)

**Admin**:
The person (or few) who approves accounts during the private alpha, from the Accounts page. Set only in the server's settings or by a command, never in the app. Sees each account's name, email, signup date and status, and nothing a person has written. Not the same as an owner of a publication.
_Avoid_: Moderator, superuser

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
One piece of writing belonging to an idea; the thing that gets published. It is counted as a draft (in the menu and the idea list) until it is marked published, though it stays in the idea's draft list.

**Editor** (of a draft):
The one member currently responsible for changing a draft's title and body and for publishing it. Everyone else can read and comment.
_Avoid_: Holder, author, lock, assignee

**Name chip**:
A person's name as a small rounded label saying who recorded, wrote or edits something (a note, a comment, a Refine message, a draft). It is always the name, never "you", and reads "A former member" when the account has gone and the name wasn't kept. It labels; it is not used inside a sentence.
_Avoid_: Author badge, avatar, byline (a byline is the author of a piece)

**Handover**:
The explicit transfer of a draft's editor role: the editor offers the draft to a named member, who accepts it. Until accepted the offerer stays editor, and can withdraw the offer. A member can ask for the draft, which only prompts the editor, and can withdraw the request.
_Avoid_: Transfer, claim

**Reassignment**:
An owner moving a draft's editor role to another member without the current editor's involvement, for when the editor is absent or gone.

### Review

**Comment**:
A remark about a passage, a paragraph or, as a general comment, the whole draft, from a person or from the AI, that the editor decides what to do with. Never carries replacement text.
_Avoid_: Suggestion, feedback item, point (the AI's critique "points" are comments)

**Edit** (comment):
Its author rewording it, while it is unresolved (and, for a reviewer, while their review is open). Only the wording changes; the paragraph and any marked words stay. An edited comment shows a small "edited" mark. Nobody can edit another person's comment, and the editor cannot edit the AI's.

**Delete** (comment):
Its author removing it for good, on the same terms as Edit. Permanent, and a critique look is not given back. The editor deals with other people's and the AI's comments by resolving, never by deleting.

**General comment**:
A comment about the whole draft rather than a paragraph: either made with the title selected, or made with nothing selected. It has no mark in the text; its card carries a "General" chip. (The code calls its anchor `WHOLE_DRAFT`.)
_Avoid_: Whole-draft comment, overall comment

**Text changed**:
The flag on a comment whose paragraph has been edited since (or is gone): a button on its card, for the editor and for members on their own comments, never on a resolved comment or for a reviewer. It opens **Then** (the paragraph as it was when the comment was made) beside **Now** (as the draft has it), with the changed words marked.
_Avoid_: Stale, outdated, orphaned (comment)

**Resolved** (comment):
Set aside by the draft's editor as dealt with: hidden, never deleted, for everyone. A resolved comment can no longer be edited or deleted by its author.
_Avoid_: Dismissed, read (the earlier names)

**Critique**:
A rationed AI review of a draft that produces ranked comments. Only the draft's editor can ask for one.

**Look**:
One critique of a draft, as the writer sees it (“2 of 3 looks used”). A draft gets a few; the writer sets how many in their account settings.
_Avoid_: Round (that is Rephrase's word), go, pass

**Review request**:
One sending of a draft for review: a snapshot, with the reviews of the people asked and any invitations not yet answered. The editor can name it; until then it is called by the date and time it was sent. The Reviews tab beside the draft shows one at a time, latest first, with how far it has got as “1 of 2 reviews complete” (those who have finished, of those reading, finished or yet to answer; closed ones don't count). Closing its reviews is final.
_Avoid_: Round, batch

**Snapshot**:
A frozen copy of a draft's title and body, made when the editor sends the draft for review. Reviewers read and comment on the snapshot, not the live draft, so their comments are about words they actually saw.
_Avoid_: Version, revision, copy

**Review**:
One reviewer's engagement with one snapshot. It is _open_ (they can comment), _ended_ (they finished it) or _closed_ (the editor stopped accepting comments); the last two are read-only but still show the snapshot and the reviewer's own comments.
_Avoid_: Round (that is Rephrase's word)

**Independent review**:
A reviewer or non-editor member sees only the draft and their own comments, never anyone else's, human or AI. Only the editor sees them all and decides how to resolve disagreements.

### Home

**Quick add**:
The tabbed small forms for adding a new idea, a note or something to read without first opening the place it goes. On a writer's landing page they add to the chosen publication's own list, never inside an idea; on a publication's landing page, to that publication; on an idea's, a note or article to that idea (there is no New idea tab). On an article's own page they take a note from that article (first tab), add another article, or (on a publication's article only) start an idea.
_Avoid_: Capture, inbox (that word is the issue tracker's)

**Keep writing**:
The short list on the landing pages (Home, a publication, an idea) of the drafts the person is the editor of that are active, each a link straight into writing it. Active means saved in the last 30 days, or with a review in progress, or with unresolved comments; where review requests exist the row says how far they have got in total (“2 of 5 reviews complete · 4 unresolved comments”). It starts with three and grows with “Show more”. Not the drafts they are only asked to review.
_Avoid_: Pick up (its old name), Recent, continue, in progress

**Published** (of a draft):
A draft its editor has marked as published, optionally with a link to the published post. It is the writer's own marker; the service does not check it. A published draft keeps its place in its idea's list, shown with a green wash, and leaves Keep writing.
_Avoid_: Done, archived

**Move**:
Taking notes, articles or whole ideas from where they are to another place: another idea, a publication's own list, or (rarely) another publication the person belongs to. An idea moves with all its drafts, notes and links, and the people who could see it only through its old publication stop seeing it.
_Avoid_: Transfer, copy (a moved note's source article is copied, but the note itself is moved)

### Rephrasing

**Rephrase**:
The action of asking for options for a passage of a draft (up to one paragraph) or for its title, which the writer has selected because they are struggling with it.

**Round**:
One set of options in a Rephrase window. A window allows as many as the writer's number of looks; asking again needs a changed Aim.
_Avoid_: Look (that is Critique's word), attempt

**Aim**:
What the writer says a passage or title should do, in their own words, stated before any options are offered. Changing it is what allows another round.
_Avoid_: Prompt, instruction, brief

**Option**:
One of a set of different approaches the AI offers to a passage or title. None is used until the writer has picked it, can edit it, and presses "Use this".
_Avoid_: Suggestion (that implies replacement text pushed at the writer), proposal (brainstorm's word for things the writer accepts), alternative

### Steps

**Scan**:
The first step of a publication (01): the recent posts from its feeds, listed for the writer to look over and to add to its list of articles or ignore. Nothing is searched; the name is what you do with the list.
_Avoid_: Search (what the step was called until #307), Feeds (the settings page where the feeds are chosen), Inspiration

**Note**:
The third step of a publication and of an idea (03): the page where notes are gathered, tagged and arranged. The step is named with a verb, like the others; the things it holds are still called notes.
_Avoid_: Notes (as the step's name)

### Refining

**Refine**:
The fourth step of an idea (04): a conversation in which your AI asks questions about the idea and suggests the points the writer makes as notes. It may suggest a sharper title, a separate idea or a page to read, but only the writer decides on those. Visiting the page spends nothing; the conversation starts from the “Refine with your AI” button.
_Avoid_: Brainstorm, coach, chat (in what people see)

**Conversation**:
One run of Refine on an idea, with your AI speaking first. An idea holds up to five, shown one at a time (newest first, paged like research), each titled (your AI names it on its first reply, marked as your AI’s until someone renames it; the date it began and who began it stand in until there is one). Everyone in the publication sees them all, any member can delete one, and each has only its own messages and suggestions. Your AI is sent the idea again with a message whenever its title, notes or articles have changed since the last one in that conversation.
_Avoid_: Thread, session, chat (in what people see)

**Suggestion**:
Something your AI puts forward beside its reply in Refine: a note, a page to read, a new idea or a new title for the idea. It sits in a list above the reply’s words and changes nothing until a person adds it. Each can be edited first, added, or ignored (and brought back).
_Avoid_: Proposal, card, recommendation (in what people see)

### Explaining

**Tutorial mode**:
A setting on a person's account that shows the explanations otherwise kept behind info icons (and short page-purpose lines that appear nowhere else) written out on the page. On for new accounts, off for others, switched from the menu at any time. It never holds anything a person needs to avoid a mistake.
_Avoid_: Onboarding, walkthrough, help mode

**Info icon**:
A small icon that holds a short explanation of one control or heading, shown on hover, focus or tap. It sits next to the thing it explains: right after a button, or at the right-hand end of the heading or field label it belongs to. Never alone on a line, and never used to explain a whole panel or tab.
_Avoid_: Tooltip (that is a plain label on hover), help button

**Tutorial note**:
The same explanation as an info icon, written out on the page below what it explains while tutorial mode is on. Some tutorial notes (what a page is for) have no icon at all and appear only in tutorial mode.
_Avoid_: Hint (a hint is always shown), help text
