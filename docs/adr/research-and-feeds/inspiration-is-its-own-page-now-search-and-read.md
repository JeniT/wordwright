# Feeds feed ideas: Scan and Read, and landing pages that summarise (#96, #98–#101, #111, #130, #229)

Feeds are where ideas start, not a setting (they have since moved back to settings: [Feeds are a settings
page](../publications/feeds-are-a-settings-page-listed-alphabetically.md)), so the first version put them on an
**Inspiration** page. It mixed two jobs and became two steps (#96): **Scan** (the recent posts, from the feeds) and **Read**
(the publication's articles and their pages). Step 01 was called Search until
[Numbered steps are verbs](../wording-and-tutorial/numbered-steps-are-verbs-search-becomes-scan-notes-becomes.md).

- **A "Find a feed" helper was built and removed the next day.** It built a feed address from a service and a topic (recipes
  for the Guardian, arXiv, Substack…), but the address patterns change without warning and each needs checking against the
  live site, so it was not worth the upkeep. It is in git history (commit 393ca10), and `docs/research/idea-source-feeds.md`
  still records the patterns. Pasting a site's address, which finds the feed it advertises, remains the way to add one.
- **A publication and an idea each have a landing page of their own** (#98, #99), none of the numbered steps, so the menu marks
  nothing current. They summarise each step and offer the next likely move: the idea's Research section shows the unread
  articles while there are any, and the research box only when there are not (#130). Opening a publication used to redirect to
  its Ideas step, which hid the overview.
- **Quick add is one panel, on Home and on both landing pages (#229).** Adding something is one way in one place, so the
  Read and Notes sections lost their own boxes and the Ideas section its "New idea" button; the sections are plain summaries.
  Rejected: a form per section (three different form styles, and the page read as a stack of forms).
- **Visiting sends nothing.** Pressing **Research** or the start button is what spends. A reply typed on the idea's landing
  page is held in memory (`lib/pending-message.ts`, never in the address) and sent by the Refine page once its thread has
  loaded, so the reply streams there and a missing-key message appears there.
- **The menu shows a count under every step that has something to count**, one shared query each, fetched only at that level.
  A long publication name is cut after two lines and the website is the word "Website" in the menu, because an address can be
  any length.
