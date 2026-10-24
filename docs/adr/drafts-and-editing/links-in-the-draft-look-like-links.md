# Links in the draft look like links (#78)

A note from a source went into the draft with a real Markdown link, but the editor had no style for links and the CSS reset
makes anchors look like their text, so it read as plain "(Title)" in brackets. Links in the editor are now underlined in the
accent colour. Because the editor edits rather than navigates, a plain click puts the cursor in the link; **Ctrl or ⌘ and
click** opens it in a new tab (a hint under the editor says so, shown only when the draft has a link). Not worth a direct
dependency on `@tiptap/extension-link` just for a tooltip.
