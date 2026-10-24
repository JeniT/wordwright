# A publication's website icon is a guest, stored apart from the picture (#177)

When a publication has a website and no picture of its own, the website's icon stands in. It is fetched with the same
`FeedFetcher.fetchIcon` the articles uses (SSRF-guarded; PNG, JPEG, GIF, WebP or ICO, never SVG, 256 KB), once
when the publication is created or its website changes, and stored in `publication_site_icons`, apart from the owner's
upload (1 MB, raster only, no ICO). Browsers get it from our own origin, so the other site never learns who looks.
It is drawn as any other site's image (`PublicationImage kind="source"`, on a plate, contained), never cropped into the
slot for the person's own picture; the owner's picture always wins, and removing it shows the icon again.

Best effort: the fetch has a 5 second limit and is throttled with the feed limiter. A failure, a timeout or a throttle
never stops the publication being saved; it just means no icon (and a changed website drops the old site's icon). It is
fetched inside the request, not afterwards, so the page the person lands on already has it.
