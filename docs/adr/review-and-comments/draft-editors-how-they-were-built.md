# Draft editors: the reasons behind the build (#154)

- **A version number, not the timestamp.** A save quotes the version it started from, so two saves in the same millisecond
  can't both win, and a stale one gets 409. The page keeps what the person typed and tells them to reload; newer words from
  elsewhere only fill the fields if nothing unsaved would be lost. Non-editors pick up changes through the ordinary refetch on
  focus, so no new dependency.
- **A draft always has an editor.** Removing a member and deleting an account hand their drafts to the longest-standing
  remaining owner first (`editor_id` is `SET NULL` only as a backstop).
- **Non-editors see no AI comments**, and the count of critiques used reads 0 for them so the route does not tell them how
  many were made. Setting a comment aside is the editor's too.
