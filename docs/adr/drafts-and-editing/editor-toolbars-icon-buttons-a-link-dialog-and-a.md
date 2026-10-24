# Editor toolbars: icon buttons, a link dialog and a Markdown mode (#243, #340)

The draft editor had no toolbar (formatting was keyboard shortcuts or typed Markdown), and the description editor had its own hand-rolled one
(#147, worded buttons). Both now use one `EditorToolbar`, which **supersedes #147's "words on the buttons"**: the owner chose icon-only buttons
(each with an `aria-label` and a tooltip with its shortcut) for a cleaner look and so the bar stays on one line.

- **What is offered is what Markdown can hold.** Draft: Paragraph, Heading 2, Heading 3 (a three-way group, not a submenu), Bold, Italic, Inline
  code, Quote, lists, Code block, Link. Inline code and code blocks stay because some writers are coders. No Heading 1 (the title is separate), and
  no underline, colour, size or alignment: they would be dropped or saved as HTML, which the renderer escapes.
- **Strike-through, rules and underline are not removed from the draft editor**, only not offered. The issue said "stay off", but they were on
  (the whole StarterKit is), and switching them off would flatten `---` or `~~x~~` already in people's drafts when they next edit.
- **One tab stop, arrow keys** (the WAI-ARIA toolbar pattern), so a bar of a dozen buttons costs one Tab. Buttons that do not fit move into a
  **More** menu rather than wrapping or scrolling (a scrolling toolbar is fiddly by keyboard and touch).
- **The link address is a modal dialog** (`LinkDialog`, `useModal`) for both editors, replacing the inline form. The dialog is a `div role=dialog`
  holding the `form`: axe rejects `role="dialog"` on a `form`.
- **Markdown mode is a plain `<textarea>` on the same saved Markdown**, drafts only (the description is short and hides Markdown on purpose).
  It is a view preference in `localStorage`, not account data. No syntax highlighting (no new dependency). Comments are editor decorations, so the
  comments tab says they cannot be shown (nothing is deleted). Rephrase works on text offsets (its "is it still what it was" check is a string
  comparison); notes and links from the side bar go in at the cursor. **Dropping a note** on the box also goes at the cursor, because a text box
  cannot report where in its text a drop landed. Switching back sets the editor's content without emitting an update, so it is not an edit and
  nothing is rewritten by the serialiser until the writer types.
- **Help:** "Formatting your draft" (`/help/formatting`) lists the buttons, the shortcuts and Markdown mode, and is linked under the draft.
- **Order follows the job (#340):** text style, then emphasis and links, then lists and quote, then code, in labelled groups
  separated by a thin rule; a group with nothing left on the bar draws no rule, so More never leaves one dangling. Comment,
  Rephrase and Edit as Markdown sit together on the right and are never in More.
- **Ctrl or ⌘ + K opens the link dialog** from the rich-text editor, and the Link tooltip says so; in the Markdown box it does
  nothing, as there is no dialog to fill in. Shortcuts that do not exist are not promised.
- **A status line above the toolbar:** the save state on the left (polite, so it changes only when the save state does, not on
  each key; a tick beside "Saved" so the state is not words alone) and the word count on the right (of the body's text, not
  its Markdown; with a selection "N of M words"). The failure and conflict callouts below the draft stay, since they carry
  the Try again button.
- **Help:** "Formatting your draft" (`/help/formatting`) lists the buttons, the shortcuts and Markdown mode.
