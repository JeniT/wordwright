# Flat tags on notes (T35)

A note can carry **tags**: short labels (up to 40 characters, up to 10 on a note) the writer chooses, such as the
draft or section a note belongs to, or a theme. They are **flat**: there is no hierarchy, and a "section of a
draft" is just a tag you use consistently. They are stored in `idea_note_tags` (one row per note and tag, in the
order given, a tag unique per note ignoring case) and go with the note.

- **Set as a whole.** `PUT /ideas/:id/notes/:note/tags {tags}` replaces the note's tags, the way notes are put in
  order. The server tidies spacing and drops repeats ignoring case (keeping the first spelling), so "Intro" and
  "intro" are one tag; empty or over-long tags are refused with a message. Editing a note's tags is part of editing
  the note (a comma-separated field, with the tags already used on the idea offered as buttons); only what changed
  is sent.
- **Filter, not a view.** A "Filter by tag" select narrows the notes list, the articles and the drafting pane
  (notes and articles) to what carries **every** chosen tag (#333; before, one tag at a time, with an "All"
  button that didn't say what was filtering). Each chosen tag stays as a removable chip ("Stop filtering by …"), so
  a filtered list never looks like the whole list. It appears only once something has a tag, and each list keeps its
  own choice. In the drafting pane it offers only tags on what can still be added. If the last item with a chosen tag
  loses it (or is added to the draft), that tag quietly drops out of the filter.
- **Putting notes in order while filtered** still works: the notes that are hidden keep their places and the
  visible ones take the places the visible ones had, so the server still gets the complete order it requires.
- **Not tags:** the AI's snapshot doesn't include them, and brainstorm doesn't tag notes (it can't edit notes).
