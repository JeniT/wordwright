# Feeds are read through a port, with the address checked at connection time

When a source is added the server reads the feed (`FeedFetcher` in `@wordwright/core`; fake and shared contract tests
as for other adapters) to refuse things that aren't feeds and to keep the title, description, website and a
picture. The address is typed by a user, so the fetch is an SSRF risk: `HttpFeedFetcher` uses `node:http(s)` with its
own DNS `lookup` that refuses loopback, private, link-local (cloud metadata), carrier-grade NAT, multicast and
mapped/NAT64 IPv6 ranges, so the check applies to the address actually connected to (checking the name first and
connecting later is open to DNS rebinding). Numeric addresses are checked directly, redirects are followed by
hand (max 5) so every hop is checked, only http(s) is allowed, time is capped at 10 s and size at 3 MB, and
`Accept-Encoding: identity` keeps the size we count equal to the size we hold. The XML parser (`fast-xml-parser`,
the one new dependency: parsing XML by hand is a worse risk) has entity expansion limits. If a pasted address is a
web page that advertises a feed (`<link rel="alternate" type="application/rss+xml">`) that feed is used, one hop only.
Adding is throttled (30/hour/person) because each add makes outbound requests.

A website can offer several feeds (WordPress also advertises one for comments; some sites have one per category or
podcast), and taking the first was often wrong. `FeedFetcher.discover` lists what a page advertises, using the page's
own titles and without reading each feed, at most 10, feeds of comments (spotted by "comment" in the title or address)
last. Adding a website that offers more than one answers `200 {choices}` and adds nothing; the choices go back one by
one as ordinary addresses, so each is read, checked and rate-limited like any other add. A direct feed address, or a
page with exactly one feed, is added at once as before, at the cost of reading it twice (once to discover, once to
add). Choices are not pre-ticked: which feed to follow is the writer's call.

A feed's recent posts are read by `FeedFetcher.readItems` and kept (`publication_source_fetches`, the posts as a JSON
list) so that opening a page never asks the feed. The rules, in `FeedItemService`: a read is used for 3 hours; a read
sends `If-None-Match`/`If-Modified-Since` from the last one, and a `304` only renews the time; after a failure the feed
is left alone for 30 minutes and the old posts keep being shown, with the error and when it last worked; an explicit
refresh can't ask the same feed within 5 minutes; people asking at once share one read; and each person may start 120
outbound reads an hour (the kept copy is still shown when they hit the limit). Per-feed ceilings like this are what
"be a good client" means in `docs/research/idea-source-feeds.md`, and all reads go through the same SSRF-safe fetch as
adding. What is kept is limited on purpose: at most 50 posts, titles, addresses, authors, the date, and the first 400
characters of the summary as plain text. Feeds often carry whole articles, and the terms of many allow personal reading
and not republishing, so we never store the body. Posts with no web address are dropped (nothing to open), `mailto:`
and similar are refused, and RSS "authors" that are email addresses are not kept. Not done: a background poller (reads
happen when someone looks, so a feed nobody opens is never fetched), JSON Feed, and per-post "seen" state (T6c).

The main list on the Search page (once called Inspiration) is **one list of recent posts across all the feeds, newest first, with a
time window**, not a list per feed (`GET .../sources/recent?days=`, default 30, 1 to 365). The point is to respond to
recent work, so a blog that posts twice a year must not put old posts in front of the writer; the window, not the
number of posts, decides what is "recent". Per-feed lists remain as a preview under each feed. The combined list
reuses each feed's kept copy (so it adds no reading beyond the rules above), reads at most five feeds at once, names
feeds it couldn't read while still using their kept posts, shows a post that two feeds carry once (under the feed
higher in the list), and stops at 100 posts, saying how many it left out. The page shows them five at a time, with Previous / Next above and below (the bottom ones return to the top of the list and move keyboard focus to its heading, since the new page starts far above them; only the upper one is announced to screen readers); paging is done in the browser over the one answer (100 small items, already cached on the server), so moving between pages costs no requests, and a new period or a check for new posts returns to the first page. **Posts with no readable date are not
listed** (guessing when they appeared would put old posts at the top); they are counted and can be seen in the
feed's own preview. The order is by date only: nothing ranks posts by how interesting they are, which would be the
AI or the service deciding what the writer should write about (docs/responsible-ai.md). Adding to the articles
(T6c) builds on this list.

**Adding posts to the articles reuses the research review's decisions** (Add, Ignore, Reconsider; a decided
post stays in the list, collapsed and marked, with a way back), applied to the combined list. The server adds a post
from its own kept copy of the feed, named by feed and post id, never from what the browser sends, so only what a
feed really said can be added, and nothing is fetched. A post becomes a publication-level article with origin
`feed` and the feed it came from. What is stored is only what was **ignored** (`feed_post_ignores`, by the post's
address as links are compared, shared by the whole publication): whether a post was **added** is read from the lists of articles themselves, so a post added by hand, or since moved to an idea, shows as added, and one whose item is removed by
hand is offered again. Reconsidering an add takes the publication-level item off (notes taken from it stay but lose their
link to it, as when any item is removed); if the post is only on an idea's list, that has to be taken off there. Adding
several at once is all or nothing, the publication's list has the same limit as an idea's, and a post already on a list
refuses the add with the reason. Posts still waiting are shown in date order only, as before: nothing ranks them. A post that has been added or
ignored goes to the **end** of the list (the server sorts, so the cap and the pages see the same order), after every
post still waiting, and decided posts follow in the order they were decided (an ignore's time, or when the item went on a
list), so the latest decision is last. Deciding keeps you on the same page, where the next waiting post takes its place.

Pictures: the site's `apple-touch-icon`/`icon`, else `/favicon.ico`, else the feed's own logo (#258: a feed's logo is usually a wide wordmark, such as the Guardian's, that can't be read at icon size; icons already stored stay until refetched). They are fetched
once, sniffed by their bytes (PNG, JPEG, GIF, WebP, ICO; never SVG, 256 KB max) and stored in the database, then
served from our own origin like publication pictures. Pointing browsers at the other site's image directly would tell
that site who is looking at the list and when. Failure to get a picture never blocks adding: a lettered tile
stands in. Feed details are read only at the time of adding, so they can go stale and sources added before this
existed have none (they show their address); refreshing is a follow-up (T19c).
