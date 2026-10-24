# Who wrote a reading-list item (#63)

A reading-list item has `authors`: a list of names (stored as JSON in `idea_links.authors`, at most 10, 100 characters
each). They are what the page says, found with the title, and the writer can correct them on the reading page.

- **Detection.** `PageInfo` has an optional `authors`; it is absent when the page names no one, so the port's other
  results are unchanged. The HTTP adapter now reads to the end of the `<head>` (it used to stop at `</title>`, before
  the meta tags) and takes the first of these that names anyone: `<meta>` `author`, `article:author` (only when it
  holds a name: it is often a publication address, which is skipped), `dc.creator`, `citation_author`, then schema.org
  JSON-LD `author`. The first source that names anyone wins, so a page isn't credited twice. Text only: names are
  decoded, tidied, de-duplicated and capped, and never treated as HTML. The fake names two authors for any address
  containing `authored`; the shared contract suite covers it.
- **The writer wins.** Authors given are kept as given. Omitted, they are left alone, unless the page is looked up
  again (blank title, or a changed address): a changed address takes the new page's authors (the old page's don't
  follow the item), and a re-lookup with an empty list asks for them to be detected again. So one form can say "look
  both up again" (blank title, blank authors), and a lookup never overwrites names the writer entered. A title given
  when adding means no lookup, so no authors are found.
- **One field, commas.** Names are typed separated by commas. A name written "Last, First" would be split in two;
  that is the cost of one plain field, and it can be revisited if people ask.
- **"By" means the piece's author.** A note's origin line reads "Quoted from “Title”, by Ada Author and Bo Writer"; the
  person who took the note is the chip (#62). The draft's record of where words came from keeps the authors **as they
  were when the words went in** (`draft_insertions.source_authors`), like the title.
- Items saved before this have no authors (`'[]'`), and an unreadable stored value reads as none rather than breaking
  the page.
