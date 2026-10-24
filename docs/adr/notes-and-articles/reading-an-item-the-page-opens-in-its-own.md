# Reading an item: the page opens in its own tab, the notes stay here (T32, decision D4)

Each reading-list item has its own page. The item's title in the list opens it, and the host name beneath the title opens the article in a new tab, so a row needs no "Take notes" button (#262). That page shows the item, an **Open the page** link (`target="_blank"`,
`rel="noopener noreferrer"`), a "I have read this" checkbox (the same say-so as on the idea page), the notes already
taken from this item, and a box to add another. A note added here is sent with `readingItemId`, so it has origin
`reading`, names the item in its origin line ("From reading “Title”", and Ada as a chip) and appears among the idea's notes too.

- **D4 option 1, not a reader view or an iframe.** Most sites forbid being framed (`X-Frame-Options` /
  `frame-ancestors`) and we can't override that, and a reader view means a new dependency, sanitising untrusted HTML
  and copyright care. Opening the page in a tab works for every site, including paywalled ones the writer can already
  read, and puts no third-party content on our origin. A reader view can come later behind the same page.
- **Side by side is the writer's to arrange.** A web page cannot ask the browser for a split view: Chrome's Split View
  API (`tabs.create({ splitWithTabId })`, Chrome 155) is for browser extensions only, and the other browsers' split
  views (Edge, Vivaldi, Firefox's experimental one, Zen) are, as far as we found, controlled only by the person. So the page only says, in plain words,
  that the two tabs are best put side by side. A browser extension would be the way to automate it; that is the
  "extension" option in D4 and not worth building for this.
- **Quote or own words:** the writer says which (see the next section).
- **The box for a new note is above the notes taken so far** (#57), so it stays in the same place as the list
  grows instead of being pushed off the screen. For the same reason the page lists its notes **newest first**, so a
  note just added shows up right under the box (the idea page keeps the writer's own order).
- **The title and authors can be edited on the reading page** (an "Edit title and authors" button by the heading),
  because the lookup often finds none and the page is then called by its address. It is the idea page's edit with the
  address left alone; a blank title asks the server to look the page up again (see "Who wrote a reading-list item").
- **Taking a note from an item marks it read, and read items go last** (#80). The server marks the item read when a
  note is added with its `readingItemId` (the first read date is kept), because a note taken from a piece means it was
  read, and the writer can still untick it. The list of articles is ordered by the server, unread first, read last, each in
  the order added, so every screen that lists it agrees and an item drops to the bottom the moment it is ticked.
- **Pasting ticks "This is a direct quote"** (#76). Words pasted into an empty note box, or over all of what is in it,
  are almost always someone else's, and a quotation stored as the writer's own words is the mistake this page must
  not make easily. So the box is ticked and the page says why ("Ticked because you pasted this. Untick it if these are
  your own words"). Typing never ticks it, nor does a paste into the middle of the writer's own words, and a writer
  who unticks it is not overruled. It is a default the writer can see and undo, not a rule.
- **Other pages found while reading** (#56) are added from the same page: a web-address box (the idea page's checks
  and title lookup, same call) puts the page in the articles as `entered`, the page stays open, and a link offers
  to read the new item next. Nothing is read or noted for the writer.
- **Publication level.** Only an idea has a list of articles so far (the publication's feeds are sources, not items), so this page
  is for an idea's items. A publication-level list (T37) would reuse the page.
