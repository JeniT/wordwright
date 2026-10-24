# The description is written in a rich-text editor, stored as Markdown (#147, part of #27)

People shouldn't need to know Markdown to describe their publication, so the description (describe page and publication settings) is written in
`DescriptionEditor`: a small Tiptap editor, using the packages the draft editor already has (no new dependency), with a toolbar
of **Bold, Italic, Bulleted list, Numbered list and Link**, and the usual shortcuts. It reads and writes **Markdown**, so the stored
format, the API, the AI context and the rendering on the publication page are unchanged.

- **Only what the description can show.** Headings, quotes, code, rules, strike-through and underline are switched off: underline would be
  saved as HTML, which the renderer escapes, and pasted headings or tables are flattened to paragraphs. The trailing empty paragraph Tiptap keeps
  is off too, so saved text doesn't end in blank lines and "select all, make a list" works.
- **Words from outside don't count as edits.** An AI draft or a saved description is loaded into the editor without being written back, so a
  description nobody has touched is saved exactly as it was. That matters: accepting an untouched draft is `…/description/confirm`, and any
  rewrite by the editor's own Markdown serialiser would have counted as an edit ("then edited by you").
- **Accessible by being ordinary.** The toolbar is five buttons with words on them (`aria-pressed` says what is on at the cursor), the text is
  a labelled `textbox`, and the link address is a small form that takes focus and gives it back, closes on Escape and refuses anything but
  web and email addresses ("example.com" means https://example.com). Over the 5000-character limit it says by how much, and saving waits.
- **Tests.** jsdom can't type into a rich-text editor, so `DescriptionEditor.test.ts` drives the real editor through its selection and the
  toolbar, and page tests swap in a plain-textarea stand-in (`src/testing/description-editor-stub.ts`); the e2e tests type in the real one.
