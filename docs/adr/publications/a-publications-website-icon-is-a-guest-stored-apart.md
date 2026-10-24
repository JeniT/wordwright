# A publication's website icon is a guest, stored apart from the picture (#177, #224, #225, #226)

When a publication has a website and no picture of its own, the website's icon stands in. It is fetched with the same
`FeedFetcher.fetchIcon` the articles use (SSRF-guarded; PNG, JPEG, GIF, WebP or ICO, never SVG, 256 KB) and stored in
`publication_site_icons`, apart from the owner's upload (1 MB, raster only, no ICO). Browsers get it from our own origin, so
the other site never learns who looks. It is drawn as any other site's image (`PublicationImage kind="source"`, on a plate,
contained), never cropped into the slot for the person's own picture; the owner's picture always wins, and removing it shows
the icon again.

- **Best effort.** The fetch has a 5 second limit and is throttled with the feed limiter. A failure, a timeout or a throttle
  never stops the publication being saved; it just means no icon. It is fetched inside the request, so the page the person
  lands on already has it.
- **Shown before saving (#224).** The website field looks the icon up when the person leaves it (blur, not each keystroke,
  and no button), and shows it in the picture tile. The preview only looks: nothing is stored, and saving fetches the icon
  again on the server, so **what is stored never comes from the client**. Silence is the failure mode. Rejected: fetching on
  every keystroke (needless visits to other people's sites) and a "Fetch icon" button for now.
- **Square icons fill the box (#225, #226).** An icon that is **square to its corners** (as wide as tall, at least 64px a
  side, and opaque at all four corners sampled just inside the edge, because a faint edge line at the corner pixel itself made
  a real logo fail) fills the image box; everything else stays on the plate. Wrong answers are safe ones (the plate). The
  check runs on the server when the icon is fetched, and the flag is stored next to the icon, so site icons and feed icons
  behave the same and the browser does no pixel work. Decoding uses `sharp` (prebuilt binaries, reads every raster format we
  accept) plus a small reader of our own for `.ico`. Rejected: a canvas check in the browser (work on every display, and not
  shared with the feed icons) and a library for ICO (one more dependency for a short parser).
