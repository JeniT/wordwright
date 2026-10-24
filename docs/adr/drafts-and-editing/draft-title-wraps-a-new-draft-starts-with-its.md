# Draft title wraps; a new draft starts with its idea's name (#366)

- **The title is an auto-growing `<textarea>` (`TitleField`)**, so a long title wraps instead of scrolling out of sight,
  in the editor and in the reviewer's read-only copy. It never holds a line break: Return moves the caret to the start
  of the body, and a pasted break becomes a space. It stays a field (not a heading) so a reviewer can select and comment on it.
- **A new draft's title is the idea's name, set once on the server** (`POST .../ideas/:id/drafts` when no title is sent).
  It is a real, editable title, not kept in step if the idea is renamed, and not AI text. The client no longer sends "Untitled".

- **"Reading item" and "reading list" became Article and Articles (#364, part of #360).** Not everything on the list is
  read (videos, podcasts), and "item" said too little. The verb is unchanged: step 02 is still **Read**, and "read /
  unread" stays. Code identifiers, API paths and database columns keep the old names until the follow-up rename. The
  words in `prompts/` changed with the rest, which is a change to what the AI is told: the owner should review it.
  Quick add's tabs read **Add:** (a label, not a tab) then **Idea · Note · Article** so they stay on one line at 390px;
  each tab keeps its longer name (New idea, Add a note, Add article) as its accessible name, and the submit buttons
  keep theirs. `TabPanels` gained `lead` and a per-tab `name` for this.
