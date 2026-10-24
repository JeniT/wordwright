# Comments: the reasons behind the build (#156)

- **One table for people's comments and the AI's.** A critique's points became comments by migration. A comment with a
  `round_id` is the AI's, so there is no `is_ai` flag to disagree with it. A name follows the keep-my-name choice (#153).
- **Visibility is decided in one function** (`visibleComments`: the editor sees everything including resolved; anyone else
  sees their own open comments), the only way a route returns comments, and the store has no per-person query to misuse.
- **Only the latest critique round's comments are listed.** Earlier rounds stay on record, but listing them would put up to 15
  AI comments beside the people's. Human comments are listed whatever the round.
- **Resolved is hidden, not deleted.** The editor sees a "Show resolved" switch only when there is something to show; numbers
  follow the whole list, so showing resolved ones does not renumber the rest.
- **Anchoring by choosing from a list** (the whole draft, or a paragraph), which is keyboard- and phone-friendly; the
  paragraphs come from the draft as _saved_, because that is what the server finds the block in. (Anchoring from a selection in
  the editor followed: [Comments from the toolbar](comments-from-the-toolbar.md).)
- **People's marks are not highlighter-coloured.** The highlighter is only for what the AI suggested, so a person's comment
  gets a plain edge and mark in the text, and a plain number chip in the list.
- **The AI boundary is structural.** `formatDraftForCritique` takes only the draft's title and body (and the publication
  description); a test writes comments from two people and checks the request sent to the model contains none of them.
