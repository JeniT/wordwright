# Reviewer's Comments panel; no General comment switch (#354)

- **A reviewer's comments sit beside the copy**, in the same `TabPanels` + `CommentsPanel` as the editor's, so they can look
  back over what they said while reading. The "located"/"Text changed" logic is not needed (the copy is frozen), so every
  comment about a paragraph in the copy simply shows it.
- **What is selected decides the target**, replacing the General comment switch (one decision fewer): the title, or nothing,
  is a general comment (`WHOLE_DRAFT`; no schema change); a paragraph is that paragraph. A reviewer's title is a read-only
  field rather than a heading so it can be selected and focused; a heading stays for screen readers. A press in the read-only
  copy, which takes no focus, is what says the words rather than the title were chosen.
- **End review in two places** while open (under the draft, under the comments), because either may be where the reader finishes.
