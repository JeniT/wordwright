# Dragging a note into the draft (#79)

Each note in the drafting side bar has a grip (⠿) that can be dragged onto the draft; the note then goes in **where it
is dropped**, by the same path as the **Add to draft** button: its words (with the source link, or as a blockquote
for a quotation) as their own paragraph(s), the draft saved first, then the origin recorded and the note set aside.
The editor's drop cursor (a line in the accent colour) shows where it will land.

- **What travels** is only the note's id, under a custom type (`application/x-wordwright-note`); the drop handler looks the
  note up (so nothing else can be smuggled into the draft by a crafted drag), and refuses one that is already in a
  draft or isn't found, with a message. Anything else dropped on the draft (a file, some text) is left to the editor.
- **At the drop point** means a paragraph is split to make room, if the note is dropped in the middle of one; at the
  start of a paragraph it goes before it. If the position can't be worked out the note goes where the cursor is, like
  the button.
- **DOM-level handlers.** The drop is caught with `handleDOMEvents`, ahead of ProseMirror's `handleDrop`, which is only
  called once ProseMirror has found a position (so it can't be exercised without layout, and a drop with no position
  would be ignored).
- **The button stays, and the grip is for wide screens.** HTML drag and drop needs a mouse and doesn't work from the
  keyboard or on most touch screens, and on a phone the draft is behind the drawer. The grip is hidden below 1024px.
- The small drag label shared with the reordering lists moved to `lib/drag-label.ts`, and the test setup now answers
  the layout questions (`elementFromPoint`, `getClientRects`) that jsdom doesn't, so the editor can be dragged over
  in component tests.
