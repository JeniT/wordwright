# Comments: how they were built (#156)

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
