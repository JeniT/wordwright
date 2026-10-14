# Wordwright

A web app that supports a writer's journey from idea to published writing, with AI that helps them judge their own words and never writes them. This file is the glossary; rationale lives in `docs/decisions.md` and `docs/adr/`.

## Language

### People and access

**Profile**:
A publishing venue: a container of ideas and drafts, with people who work in it.
_Avoid_: Workspace, account, blog

**Owner**:
A person who administers a profile (invites and removes people, reassigns drafts).
_Avoid_: Admin

**Member**:
A person who works in a profile. An owner is also a member.
_Avoid_: Collaborator, user, profile editor

**Reviewer**:
A person invited by email to read and comment on a draft, without being a member of its profile. Has a reviewer-only account, which can be upgraded to a full one.
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
