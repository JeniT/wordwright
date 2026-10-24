# The website's icon is shown before saving (#224)

The site icon (#177) used to appear only after a publication was created or its website changed. Now the website field
looks the icon up when the person **leaves** it (blur, not each keystroke, and no button: the page does the step), and
shows it in the picture tile of the new publication form; in the settings, a small "Icon found for this address" line
under the field appears for an address that differs from the saved one (the saved icon is already shown under Picture).

`POST /api/publications/site-icon-preview` takes `{ siteUrl }` and answers `{ iconUrl, square }`, where `iconUrl` is a
data URL (or null). It only looks: nothing is stored, and creating or saving fetches the icon again on the server, so
**what is stored never comes from the client**. It reuses `fetchSiteIcon` (same address guard, 5-second timeout, size and
type rules) and the feed throttle (30 an hour per person), answering 429 past it. Silence is the failure mode: no icon,
an error or a throttle just leaves the tile as it was. A reply for an address that has since changed is dropped. The
writer's own picture still wins over it.

Rejected: fetching on every keystroke (needless visits to other people's sites) and a "Fetch icon" button for now (add one
only if blur proves slow or flaky).

**Amendment: sample just inside the edge.** A first real logo (a square with a one-pixel, half-transparent border line)
failed the exact-corner check, because that line is faint at the corner pixel itself. The corners are now sampled 2px in
(1% of the side for larger icons): a faint edge line is ignored, while a rounded icon still has transparent corners there.
Only a rounded corner with a radius under about 7px at 256px would now read as square, which looks square anyway. The
stored flags from the first rule were cleared by a migration, so the startup backfill recomputes them.
