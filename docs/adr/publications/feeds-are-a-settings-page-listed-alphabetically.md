# Feeds are a settings page, listed alphabetically (#242, #258)

Feeds are configuration, like the description, so they live in publication settings (`/p/:id/settings/feeds`, between
Description and Sharing), not on the Scan step. **Scan keeps only Recent posts**, with a way to the feeds: a "Set up feeds →"
button while there are none (the thing to do next), and a quiet "Manage feeds" link once there are some; the landing page's
Scan section has the same two. Any member can add and remove feeds.

- **No reordering.** The order was meant to rank posts, but Recent posts has always been sorted by date; the order only broke
  ties, and a drag list is a lot of interface for that. Feeds are **alphabetical by the name shown**. The `position` column
  stays (migrations are append-only) and records the order added, which is the tie-break.
- **The settings list is just the feeds** (#258). A feed's posts are on Scan, in one list with the feed's name, so showing
  them under each feed was a second, slower way to the same thing. A failed feed's line says to check the address or remove it.
- **The add form sits above the list**, since in settings the thing you come to do is add one.
- **"Feed" in the words people see, "source" in the code.** The glossary term is **Feed** (CONTEXT.md); `Source`,
  `PublicationSources` and the API paths keep their names, since renaming them is churn for no gain.
- Addresses are normalised (https assumed, fragment dropped) so the same feed can't be listed twice.

**What survived from the ordered list.** Feeds were once a drag-to-reorder list, saved by sending the whole order (the server
refuses with 409 unless the ids are exactly the current ones, so a stale screen can't drop or resurrect a feed). The reusable
part is `ReorderableList`, which notes and an idea's drafts still use: a move is **shown at once and saved in the
background** (#60), because waiting for the server made reordering feel stuck; it sends one save at a time carrying the whole
order as shown by then, so an older reply can never undo a newer move; if a save fails it goes back to the saved order,
announces that, and the page shows the reason and refetches.
