# Edit and delete your own comment (#344, part of #338)

- **Own comments only, while unresolved.** Enforced by `services/comments.ts`, not the UI: someone else's comment, a comment
  from another review, and the AI's answer 404 (so existence is not given away); a resolved one answers 409. The editor has no
  power over others' comments: they resolve them. A reviewer can change theirs only while their review is open; members and
  the editor use the draft's routes.
- **Edit changes the words only** (`edited_at`, shown as a small "edited" mark). Paragraph, hash and marked words stay, so
  "Text changed" still compares with the paragraph as it was when first commented.
- **Delete is permanent and uses `HoldButton`.** There are no replies in the model yet, so nothing cascades; a critique look is
  not given back, as the reading was done.
