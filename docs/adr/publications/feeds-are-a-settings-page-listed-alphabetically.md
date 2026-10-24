# Feeds are a settings page, listed alphabetically (#242)

Feeds are configuration, like the description, so they moved off the Search step into publication settings
(`/p/:id/settings/feeds`, between Description and Sharing). This reverses the decision that they are managed on Search;
**Search keeps only Recent posts**, with a way to the feeds: a "Set up feeds →" button while there are none (the thing to do
next), and a quiet "Manage feeds" link once there are some. The landing page's Search section has the same two. Any member
can still add and remove them.

- **No reordering.** The order was meant to rank posts, but Recent posts has always been sorted by date; the order only broke
  ties, and a drag list is a lot of interface for that. Feeds are now **alphabetical by the name shown** (sorted in the
  browser). `PUT …/sources/order`, `SourceOrderSchema`, the store's `reorder`, the tests and the drag e2e are gone; the
  `position` column stays (migrations are append-only) and records the order added, which is the tie-break.
- **The add form sits above the list**, since in settings the thing you come to do is add one; an empty list then reads
  "No feeds yet. Add one above."
- **"Feed" in the words people see, "source" in the code.** The glossary term is **Feed** (CONTEXT.md); `Source`,
  `PublicationSources` and the API paths keep their names, since renaming them is churn for no gain.
- The failed-feed line still says "Open its recent posts for details", because each feed's own recent posts stay on its row.
