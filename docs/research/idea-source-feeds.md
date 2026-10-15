# What feeds do popular sources offer? (research for idea generation, T6/T19c)

Question: do blogs, news sites and academic sources all have RSS, and will we need to filter feeds after
downloading them (or do sources offer topic-specific feeds)?

Researched 9 Oct 2026 from web searches, plus **live checks**: I pointed our own feed reader
(`HttpFeedFetcher`) at the real feeds below. "Live" means that check succeeded on that date; everything else comes
from third-party pages and is marked as such. I could not open the NYT, Guardian or BBC help pages themselves
(the tool was blocked), so their rules come from older or secondary sources.

## Short answer

Your assumption holds for blogs and newsletters, mostly holds for academic sources, and is shakier for news.
**But the useful finding is that publishers rarely give you one big feed that needs filtering: they give you many
small feeds, one per section, topic or subject, and expect you to pick.** Filtering after download is still needed,
but in fewer places than expected, and the choice of feed does most of the first-pass filtering. Search-based
feeds exist for some sources and not others, and where they don't (most scholarly search) the answer is an API,
not RSS.

## 1. Blogs and newsletters: RSS is nearly universal, no filtering needed

| Platform    | Feed address                                                                                           | Notes                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Substack    | `<publication>/feed` (also on custom domains)                                                          | Paid posts show a preview only. Publications can switch RSS off. **Live:** worked.                              |
| WordPress   | `/feed`; per category `/category/<name>/feed`; **search** `/?s=term&feed=rss2`                         | Search-as-feed is built in. Sites can disable feeds.                                                            |
| Ghost       | `/rss/`; per tag `/tag/<slug>/rss/`                                                                    | `/feed` does _not_ work on Ghost.                                                                               |
| Medium      | `medium.com/feed/@user`, `/feed/<publication>`, `/feed/tag/<tag>`                                      | 10 items; tag feeds have no body text; paywalled stories are not in full. **Live:** tag feed worked.            |
| Bluesky     | `bsky.app/publication/<handle>/rss` (since Jan 2024)                                                   | Per person only; no keyword or hashtag feeds. **Live:** worked.                                                 |
| Hacker News | official `news.ycombinator.com/rss` (front page); **search** via third-party `hnrss.org/newest?q=term` | The search feed is a volunteer service. **Live:** worked.                                                       |
| Reddit      | `/r/<sub>/.rss`, search `/search.rss?q=term&sort=new`                                                  | Undocumented; **Live:** answered 429 (rate limited) to our server. Reddit is reported to block data-centre IPs. |

Pasting the **site's home page** is what most people will do, so feed discovery matters. Our reader now follows
`<link rel="alternate" type="application/rss+xml">`. **Live:** `astralcodexten.substack.com` and
`oneusefulthing.org` both resolved to their feeds. These are the "specialist sources" in your second category:
subscribe and take everything.

## 2. News: mixed, and getting worse

- **Many outlets offer a feed per section or topic**, so topic selection happens by choosing the feed.
  - The Guardian: add `/rss` to nearly any section, topic or writer page (20 newest items each). **Live:**
    `theguardian.com/world/rss` and `.../technology/artificialintelligenceai/rss` both worked.
  - BBC: per-section feeds on `feeds.bbci.co.uk`. **Live:** `feeds.bbci.co.uk/news/rss.xml` worked.
  - NYT: per-section feeds on `rss.nytimes.com`. **Live:** `.../nyt/Technology.xml` worked.
- **Others have given up on RSS.** Reuters stopped updating public feeds in June 2020 (**live:** the old feed
  address now returns 404), AFP turned its feeds off without announcement, The Times (UK) removed its feeds, and
  Apple News stopped letting people add arbitrary feeds. The decline is uneven (BBC, NYT and the Guardian are
  still fine), so assume some of a writer's favourite outlets have no feed.
- **Workarounds**, all with caveats:
  - _Google News search feed_ `news.google.com/rss/search?q=...&hl=en-US&gl=US&ceid=US:en` supports operators
    (`OR`, quotes, `site:`, `when:1h`). It is undocumented, returns about 100 items, and links go through Google
    redirects rather than to the article. **Live:** worked. It is the common substitute for outlets with no
    feed (`site:reuters.com`).
  - Generated feeds: OpenRSS (non-profit), FiveFilters Feed Creator, and self-hosted RSS-Bridge scrape pages
    into feeds. They break when sites change and depend on the site's terms.
- **What an item contains:** usually a headline, a one- or two-sentence summary and a link, not the article.
  That is enough to judge relevance (title + summary), not enough to quote.
- **Terms of use** vary: Grist and others limit feeds to personal, non-commercial use; the BBC (per 2005
  coverage) bars charging for access and requires attribution; the NYT objected to a paid reader in 2010. Our use is the writer's private research list, but this
  matters if we ever redistribute or sell anything built on feed content. See "Terms" below.

## 3. Academic sources: lots of RSS, organised by publication and subject, not by query

| Source                           | What you can subscribe to                                                                                                                                                                                                                                                 | Items include                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| arXiv                            | One feed per archive or category, and several joined with `+`: `rss.arxiv.org/rss/cs.CL`, `.../atom/cs.AI+q-bio.NC`. Refreshed daily at midnight US Eastern; empty at weekends; capped at 2,000 items. **Live:** both worked.                                             | Abstract, authors, and an "announce type" (new, cross-list, replacement). |
| bioRxiv / medRxiv                | Feed per subject, subjects joinable with `+`: `connect.biorxiv.org/biorxiv_xml.php?subject=neuroscience`. 30 most recent. **Live:** worked.                                                                                                                               | Title, abstract                                                           |
| PubMed                           | **Any search can become an RSS feed** ("Create RSS" on the results page, needs a free NCBI login in current guides). The only true query-based scholarly feed found. **Live:** the search page itself is not a feed; the person has to create the feed address on PubMed. | Citation, abstract link                                                   |
| Nature                           | Per subject `nature.com/subjects/<subject>.rss` and per journal `nature.com/<journal>.rss`. **Live:** both worked.                                                                                                                                                        | Title, short description                                                  |
| Science (AAAS)                   | Table-of-contents feed per journal. **Live:** `science.org/action/showFeed?type=etoc&feed=rss&jc=science` worked.                                                                                                                                                         | Title, authors                                                            |
| Other publishers                 | Springer/BMC (`/rss`), Wiley, Taylor & Francis link feeds from each journal page. Addresses change without warning according to several library guides.                                                                                                                   | Mostly table of contents                                                  |
| JournalTOCs                      | Free aggregator that finds feeds for tens of thousands of journals by title, subject or publisher.                                                                                                                                                                        | Table of contents                                                         |
| SSRN                             | RSS only for author pages and top-10 rankings; subject subscriptions are email.                                                                                                                                                                                           | —                                                                         |
| Google Scholar, Semantic Scholar | **Email alerts only**, no RSS.                                                                                                                                                                                                                                            | —                                                                         |

Where there is **no feed**, the route is an API with a query and a "published since" filter, polled by us:
Crossref (`filter=from-created-date:...`), OpenAlex (`search=` plus `from_publication_date`), Semantic Scholar
(`/paper/search`, heavily rate-limited without a key) and Europe PMC. None of these has saved searches or alerts
of its own, so "new since last time" would be our job. That is the `SearchProvider` port the repo already has for
D2, and it is why D2 is still open.

## 4. Where would filtering after download actually be needed?

1. **Broad feeds**: an entire arXiv archive (`cs` is hundreds of papers a day), "all subjects" bioRxiv, a news
   front page, Google News on a general term, Hacker News front page. Here almost everything is irrelevant to a
   given writer, so filtering is essential.
2. **Everything with a topic feed already** (Guardian tag, arXiv subcategory, Medium tag, WordPress category) is
   pre-filtered by choosing it. Filtering adds precision, not necessity.
3. **Specialist blogs and newsletters** need none, as you assumed.

Practical conclusions:

- Your two categories map cleanly onto a per-source setting, "take everything" vs "filter by my interests"
  (T19c). A sensible default is "filter" for known firehoses and "take everything" otherwise, and the person can
  override.
- **Helping the person find the right feed is worth as much as filtering.** Many will not know that the
  Guardian's AI page has a feed, or that `rss.arxiv.org/rss/cs.CL` exists. A small "recipes" feature, where the
  person picks a service (arXiv category, Google News search, Hacker News search, Reddit search, WordPress search)
  and a topic and we build the address, would remove the need to know URL patterns. Pasting a site and finding
  its feed is already done.
- **What to filter on**: arXiv, bioRxiv and PubMed items carry abstracts, so keyword matching and an LLM
  relevance check have something to work with. News items have headline + summary, enough for a cheap
  title-and-summary relevance pass. Medium tag feeds have no body text at all. A first filter on keywords
  (free), then an LLM pass on the survivors in batches with a small model (using the person's own key, per the
  repo's rule), keeps the cost low.
- **Plan for feeds that break.** Feeds move, close or throttle (Reuters, Reddit, Wiley's URL changes). We should
  record when a source last worked, show it in the list, and not retry aggressively.
- **Be a good client**: send an identifying User-Agent (done), respect cache headers and use conditional requests
  (`ETag`/`If-Modified-Since`) when we start polling, and avoid polling faster than a few times a day. arXiv asks
  users to read its API terms; OpenRSS publishes polling etiquette.
- **JSON Feed** is a third format some tools offer (hnrss does). Our reader handles RSS 2.0, RSS 1.0 and Atom
  only. Few big sources use it, so low priority.

## 5. Terms

Feed terms vary and are often "personal, non-commercial use only" (Grist and several others; the BBC and NYT have
had similar restrictions). Storing
titles, summaries and links for a writer's own idea list is the intended use. Before building anything that
shows other people's content to third parties, or generates published text from it, re-read each source's terms;
and never store full article text from feeds that only give excerpts. I am not a lawyer; this is a flag, not
advice.

## Verification gaps (worth a quick manual check)

- NYT, Guardian and BBC rules and complete section lists: only partly verified (live feeds work; help pages
  were not readable).
- PubMed's current "Create RSS" steps: documented in older NLM pages and library guides, not checked in the live
  interface. The NCBI-login requirement comes from one library guide.
- Crossref/OpenAlex/Semantic Scholar details come from documentation mirrors and wrappers, not the official sites.
- Medium's item count and Substack's "RSS can be disabled" come from third-party descriptions.

## Sources

- arXiv: [RSS help](https://info.arxiv.org/help/rss.html), [RSS specifications](https://info.arxiv.org/help/rss_specifications.html), [2024 relaunch](https://blog.arxiv.org/2024/01/31/attention-arxiv-users-re-implemented-rss)
- bioRxiv/medRxiv: [medRxiv alerts and RSS](https://www.medrxiv.org/alertsrss)
- PubMed: [CDC library guide](https://cdc.gov/library/research-guides/search-alert.html), [Berkeley guide](https://guides.lib.berkeley.edu/pubmed-more-search-tips/rss-and-alerts), [NLM technical bulletin (2005)](https://www.nlm.nih.gov/pubs/techbull/mj05/mj05_rss.html)
- Nature: [web feeds example](https://www.nature.com/nrc/web-feeds), [NPG feeds archive](https://web-archive.nli.org.il/National_Library/mp_/https://www.nature.com/webfeeds/)
- Publishers and aggregators: [SpringerOpen RSS](https://springeropen.com/get-published/indexing-archiving-and-access-to-data/rss-feeds), [JournalTOCs overview](https://www.software.ac.uk/blog/journaltocs), [Florida State publisher alerts guide](https://guides.lib.fsu.edu/alerts/academicalerts/publishers)
- SSRN: [RSS and data feeds](https://www.elsevier.support/ssrn/answer/what-are-rss-and-data-feeds-on-ssrn)
- Google Scholar / Semantic Scholar: [Cornell guide](https://guides.library.cornell.edu/olingrad/keepingcurrent), [Semantic Scholar alerts FAQ](https://webflow.semanticscholar.org/faq/alert-types)
- APIs: [Crossref filters](https://crossref.org/documentation/retrieve-metadata/rest-api/rest-api-filters), [OpenAlex filtering](https://developers.openalex.org/guides/filtering)
- News: [Guardian feeds (Feeder guide)](https://feeder.co/knowledge-base/rss-content/guardian-rss-feeds/), [NYT feeds (Newsloth)](https://newsloth.com/popular-rss-feeds/nytimes-rss-feeds), [Reuters feeds (Feeder)](https://feeder.co/knowledge-base/rss-content/reuters-rss-feeds/), [The Times removes feeds (OpenRSS)](https://openrss.org/blog/the-times-destroy-rss-feeds-after-encouraging-use), [AFP turns off RSS (SitePoint)](https://www.sitepoint.com/it-was-a-good-idea-for-the-afp-to-turn-off-rss/), [Apple News drops RSS](https://birchtree.me/blog/apple-news-drops-support-for-rss/)
- Google News search feeds: [Newscatcher guide](https://newscatcherapi.com/blog/google-news-rss-search-parameters-the-missing-documentaiton), [Feedly docs](https://docs.feedly.com/article/375-what-are-some-of-the-advanced-keyword-alerts-google-news-search-parameters)
- Platforms: [Substack feeds (OpenRSS)](https://openrss.org/blog/substack-feeds), [Medium feeds](https://help.medium.com/hc/en-us/articles/214874118-Stats), [WordPress search feeds](https://learn.wordpress.org/tutorial/saving-a-search-as-an-rss-feed/), [Ghost feeds](https://ghost.org/help/where-can-i-find-my-rss-feed/), [hnrss](https://hnrss.org), [Reddit feeds (Feeder)](https://feeder.co/knowledge-base/rss-feed-creation/reddit-rss), [Bluesky RSS (OpenRSS)](https://openrss.org/blog/bluesky-has-launched-rss-feeds)
- Terms: [BBC feed licence coverage (2005)](https://technollama.co.uk/bbc-opens-rss-content), [NYT RSS dispute (2010)](https://archive.techdirt.com/articles/20100608/0840209733.shtml), [Grist RSS terms](https://grist.org/about/rss-terms/)
- Generated feeds: [FiveFilters Feed Creator](https://help.fivefilters.org/feed-creator/), [OpenRSS: requesting a feed](https://openrss.org/guides/requesting-a-new-open-rss-feed)
