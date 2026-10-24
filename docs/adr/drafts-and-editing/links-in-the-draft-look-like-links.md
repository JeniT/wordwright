# Links in the draft look like links (#78)

A note from a source went into the draft with a real Markdown link (`([Title](../../address))`), but the editor had no style
for links and the CSS reset makes anchors look like their text, so it read as plain "(Title)" in brackets. Links in
the editor are now underlined in the accent colour. Because the editor edits rather than navigates, a plain click
puts the cursor in the link; **Ctrl or ⌘ and click** opens it in a new tab (a hint under the editor says so, shown only
when the draft has a link). It is a DOM `click` handler, not ProseMirror's `handleClick`, which only runs on a real
mouse down/up with layout. StarterKit's link `HTMLAttributes` (a tooltip) were not applied, and adding
`@tiptap/extension-link` as a direct dependency just for a tooltip wasn't worth it.
