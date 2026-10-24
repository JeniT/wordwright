# Idea sources: an ordered list of feeds, edited by any member

> **Ordering removed in #242** (see _Feeds are a settings page_, at the end of this file). Kept as the record of why it was built.

Idea generation will scan RSS feeds, so each publication holds a list of feed URLs (D2: RSS first). Order is the
priority later used to rank posts, so it is stored as a dense `position` and changed by sending the whole list of
ids (`PUT .../sources/order`) rather than "move X to N": the server refuses (409) unless the ids are exactly the
publication's current sources, so a stale screen can't drop or resurrect a feed, and drag, buttons and two editors
all use the one operation. The UI offers drag and drop (HTML5, grip handle, a small label as the drag image, a
line shows where it will land) and, as the keyboard and touch route, up/down buttons; native drag and drop does not work on
most touch screens, and a library for it wasn't worth a dependency. That interaction lives in one component,
`ReorderableList` (also used for an idea's drafts and notes), so every list people can reorder looks and behaves
alike: it works out the new order and the page's `save` stores it. A move is **shown at once and saved in the
background** (#60): waiting for the server made reordering feel stuck on a slow connection, and the page then also
waited for two refetches. The list keeps its own pending order and ignores what `items` says until the saves are
done; it sends **one save at a time**, each carrying the whole order as it is shown by then, so quick moves collapse
into at most one in flight and one waiting and replies can't arrive out of order, and an older reply can never undo a
newer move. If a save fails (a 409 because someone else changed the list, or the network), it goes back to the saved
order, drops any move built on the one that didn't save, announces that, and the page shows the reason and
refetches. After a success it shows `items` again only once they match, since the page updates them a moment after
the save resolves; if they never do, it gives up after 3 seconds. Rows that other people add meanwhile go last. The
arrows are not disabled while saving. Like drafts, the list is shared working
material, so **any member** can change it, not just the owner. Addresses are normalised (https assumed, fragment
dropped) so the same feed can't be listed twice.
