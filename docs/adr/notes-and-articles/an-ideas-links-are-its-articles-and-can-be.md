# An idea's links are its articles, and can be marked read (T31)

What the idea page called "Related work" is now the idea's **Articles**, and the publication's RSS feeds are
**Articles sources**: the two are still separate tables and routes (an idea's items are links someone chose; the
publication's sources are feeds that will later fill a publication-level list, T37). The code keeps its old names (`idea_links`, `IdeaLink`, `PublicationSources`): renaming them is churn for no gain.

- **Read is the writer's say-so.** Each item has `read_at` (null until marked), set by a plain checkbox, because the
  app can't know that a page was read, and people read things offline. Marking read twice keeps the first date;
  unticking clears it. The checkbox is the whole mechanism; the friction before citing an unread item is T34.
- **Origin.** Each item records `origin`: `entered` (the writer, and everything so far), `brainstorm`, `research` or
  `idea_generation`, so items an AI suggested are visibly marked ("Suggested in brainstorming", "Found by
  research"), per [responsible-ai.md](../../responsible-ai.md) principle 5. `entered` came first; T38 now produces
  `brainstorm` (a page the writer gave the coach) and `research`, and T37 will produce `idea_generation`. The database refuses any other value.
- **Notes from reading.** `POST …/notes` takes an optional `readingItemId` (it must be on the same idea). Such a
  note has origin `reading` and says which item it came from ("From reading “Title”", and Ada as a chip). Removing the item
  keeps the note, and its origin, but not the link to the item. The screen for taking notes while reading is T32.
- **Not changed:** what the brainstorm AI is told. Its snapshot still says "Related links the writer has saved", and
  doesn't mention what is read; changing that would be a prompt change for the owner to review.
