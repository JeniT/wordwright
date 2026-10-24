# Remove link, and the description field's focus (#251)

- **Remove link** joins the editors' toolbars (after Link). It is `unsetLink`, which removes the link from just the selected words when some are
  selected, and from the whole link when only the cursor is in one. The Remove link button in the link dialog does the same, so the two never
  differ. The button is disabled when nothing selected is in a link (and skipped by the arrow keys, since a disabled button cannot take focus).
- **The description field's focus** had the app's 3px focus outline drawn by the text box inside a bordered `field`, so it showed a heavy ring within
  a border. It now follows the `field` rule: the border changes to the focus colour, and the outlines stay but are transparent, so forced-colours
  mode still draws one.
- Playwright's `getByRole('button', { name: 'Link' })` is a substring match and now also finds Remove link: e2e tests use `exact: true`.
