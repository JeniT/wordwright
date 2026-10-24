# Sample posts for describing a publication: found and read without AI, kept nowhere (#134, part of #27)

> **Removed in #150** (see _Publication descriptions are written by the writer_, at the end of this file). Kept as the record of why it was built.

To draft a publication description (#135, #136) the writer chooses 3 to 5 sample posts: ticked from the newest ten of the
publication's own feed, and/or pasted as links. Finding and reading them is a chore, not writing, so no LLM is involved
and the routes are `POST /api/publications/:id/publication/posts` (`{ siteUrl? }`, defaulting to the publication's website) and
`POST /api/publications/:id/publication/samples` (`{ urls }`, one to five), open to every member. Both are `POST` because they make
the server fetch other people's pages; neither saves anything, so a post's text exists only in the answer to the
request that read it.

- **The feed** is found with the existing `FeedFetcher` (`discover`, which puts feeds of comments last, then
  `readItems`); the first feed is used, because choosing between feeds is what #68 is for and a description needs
  only an idea of the publication. No feed, an unreachable site or an empty feed is not an error: the answer is
  `{ posts: [], notice }` with a sentence that ends "Paste links to a few of its posts instead", so the writer is never stuck.
- **The text** comes through a new `PageTextFetcher` port (title, plain text, `truncated`), with a fake and a contract
  suite. Its HTTP adapter shares everything that makes `HttpPageInfoFetcher` SSRF-safe by using one class,
  `SafeReader` (public addresses only, checked at connect time; hand-followed redirects; ports 80/443; no cookies;
  uncompressed so the cap is real), which `HttpPageInfoFetcher` now uses too, so the two can't drift apart. It
  differs in reading up to 1 MB (not just the head) with an 8 s deadline. Text is extracted without a parser
  dependency, in the same spirit as the title: the page's `<article>` (else `<main>`, else the body), without scripts,
  styles, menus, headers and footers, entities decoded, never markup, cut at a word at 8000 characters (`truncated`
  says so). A page whose words come from scripts gives "couldn't read", not an empty sample.
- **Each link answers on its own** (`ok` with title and text, or `ok: false` with what the person can do), so one
  dead link doesn't lose the others. More than five is refused (400), repeats are read once.
- **Throttle:** one allowance of 20 an hour per person covers both routes (each looks at a site and up to five pages).
- The text goes back to the browser rather than being kept server side, so #135 can either take the samples from
  the page or read the links again itself; choosing which is #135's. Whatever it does, the text is **data, never
  instructions** (fetched pages can say anything), as for the research prompts.
