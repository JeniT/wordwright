# An idea's articles: read on their own page, marked read by the writer (T31, T32, D4, #287)

What the idea page called "Related work" is the idea's **Articles**, and the publication's RSS feeds are **Article
sources**: separate tables and routes (an idea's articles are links someone chose; the publication's sources are feeds). The
code now uses the same words (`articles`, `Article`, `articleId`; renamed in #368).

**Read is the writer's say-so.** Each article has `read_at` (null until marked), set by a plain checkbox, because the app
can't know that a page was read, and people read things offline. Marking read twice keeps the first date; unticking clears it.
Taking a note from an article also marks it read (#80), because a note taken from a piece means it was read, and the writer
can still untick it. The list is ordered by the server, unread first, so every screen that lists it agrees.

**Each article has its own page.** The article's title opens it; the host name beneath opens the article in a new tab, so a
row needs no "Take notes" button (#262). The page shows the article, an **Open the page** link, the read checkbox, the notes
already taken from it, and a box to add another. A note added here has origin `reading`.

- **The page opens in a tab, not a reader view or an iframe (D4 option 1).** Most sites forbid being framed
  (`X-Frame-Options` / `frame-ancestors`) and we can't override that, and a reader view means a new dependency, sanitising
  untrusted HTML and copyright care. A tab works for every site, including paywalled ones the writer can already read, and
  puts no third-party content on our origin. A reader view can come later behind the same page.
- **Side by side is the writer's to arrange.** A web page cannot ask the browser for a split view (Chrome's Split View API is
  for extensions only, and other browsers' split views are controlled by the person), so the page says, in plain words, that
  the two tabs are best put side by side. An extension would automate it and is not worth building for this.
- **Pasting ticks "This is a direct quote" (#76).** Words pasted into an empty note box, or over all of it, are almost always
  someone else's, and a quotation stored as the writer's own words is the mistake this page must not make easily. The box is
  ticked and the page says why. Typing never ticks it, nor does a paste into the middle of the writer's own words, and a
  writer who unticks it is not overruled: it is a default the writer can see and undo, not a rule.
- **The box for a new note is above the notes taken so far, and notes are listed newest first** (#57), so a note just added
  appears right under the box instead of being pushed off the screen.
- **Title and authors can be edited on the page**, because the lookup often finds none and the page is then called by its
  address; a blank title asks the server to look the page up again.
- **Other pages found while reading** (#56) are added from the same page by address; the page stays open and a link offers to
  read the new article next. Nothing is read or noted for the writer.
- **Only the AI's words are marked (#287).** An article the AI suggested keeps its reason in the highlighter, with one
  highlighted line above the list explaining it. Badges for where an article came from ("Found by research", "From a feed")
  are gone, because the highlighted reason already marks what is the AI's, per principle 5 of
  [responsible-ai.md](../../responsible-ai.md). The `origin` is still recorded for the database.
- **Removing an article keeps its notes** and their origin, but not the link to the article.
