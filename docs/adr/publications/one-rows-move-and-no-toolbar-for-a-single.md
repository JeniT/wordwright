# One row's Move, and no toolbar for a single row

- **A list with one row has no toolbar** (`RowList` leaves the `toolbar` slot out), as there is nothing to select all of or act on in bulk, and the tick on
  that row goes too. A list that can be filtered passes `keepToolbar` (notes, when a tag is chosen), or the funnel would vanish with the one match.
- **Every note, article and idea has its own Move icon** (`Icon name="move"`, with the Edit and Remove icons), so a lone row can still be moved. It
  opens a dialog (`ConfirmDialog`, `canConfirm` keeps its button off until a place is chosen) holding the same form as the toolbar's (`MoveFields`,
  `MoveNotesDetails`, `MoveIdeasFields`), and moves that row alone, whatever else is ticked. The articles keeps its toolbar for a single item, as its
  funnel also holds the Show read items switch.
