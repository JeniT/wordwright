# Notes on the idea page: cards or a list, one shared reorderable list (T29)

The idea page's single "Expand on your idea here" box is replaced by a **Notes** section that talks to the `/notes`
routes (the box on the _new idea_ page stays; what is typed there becomes the first note). Each note shows its
text, where it came from (added by hand, from brainstorming, from reading) and Edit / Delete; a box underneath adds
the next one. The idea's name form now saves only the name.

- **A list, not cards.** Notes were first offered as cards or a list, with a toggle (T29). The cards were removed
  (#59): dragging between cards two across didn't work in the owner's Chrome (it did in an automated run, so it
  was likely down to real pointer behaviour), and cards look uneven for notes of very different lengths. Notes are
  one `ReorderableList`, like the idea sources and an idea's drafts.
- **Deleting is immediate**, as for related-work links, with no confirmation or undo. Revisit if people lose notes.
- **Brainstorm is unchanged.** It still shows and proposes the notes as one Markdown text (T28b) until T30, so
  accepting a "replace the notes" suggestion still replaces them all with what the AI wrote.
