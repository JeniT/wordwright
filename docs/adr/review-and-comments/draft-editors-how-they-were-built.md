# Draft editors: how they were built (#154)

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
