# Inspiration is its own page (now Search and Read)

The publication's feeds moved out of Settings onto an **Inspiration** page (`/p/:publicationId/inspiration`, linked from the
publication page): they are where ideas start, not a setting, and the posts they bring (T6c) and the articles will
live nearby. Same component, same API.

A "Find a feed" helper (build a feed address from a service and a topic, from recipes for the Guardian, arXiv,
Substack and so on) was built and then **removed** the next day: in use it wasn't helpful enough to justify the
upkeep, since the address patterns change without warning and each one needs checking against the live site. It is
in the history (commit 393ca10) if the idea comes back, and `docs/research/idea-source-feeds.md` still records the
patterns. Pasting a site's address, which finds the feed it advertises, remains the way to add one.

**Split (#96).** Inspiration mixed two jobs, so it became two steps: **Search** (`/p/:publicationId/search`: the recent
posts and the feeds) and **Read** (`/p/:publicationId/read`: the publication's articles, and its reading pages). The old
`/inspiration` address leads to Search (to Read when it has `#reading-list`), and `/reading` to Read. Notes and Ideas
moved to 03 and 04.

**Landing pages (#98).** Opening a publication used to redirect to its Ideas step. `/p/:publicationId` is now a page of its
own, titled "Overview", that summarises the publication: its five latest notes with a form to add one, and its ideas. It is
none of the numbered steps, so the menu marks nothing current, like the settings pages. "Latest" notes means newest
made, not the writer's own order on the Notes step. The idea level gets the same treatment (#99), under umbrella #95.

**Search and Read panels (#100).** The publication's page also summarises Search (the five newest posts still waiting for a
decision, newest first, each opening in a new tab, with "See more and set up feeds") and Read (the first five items not
yet read, each opening its reading page, a box to add a web address, and "See the articles"). The posts panel
asks for the same lists under the same keys as the Search page, at its default period, so they share what has been
fetched; opening the page never asks the feeds to check again. It has no Add or Ignore buttons: deciding is on Search.
The add-a-link form is shared with the Read page (`AddLinkForm`).

**Idea landing page (#99).** `/p/:publicationId/ideas/:id` used to redirect to Notes; it is now the idea's landing page,
none of the numbered steps. Research: the number of sources with a link to the articles, and the same research box
as the Research page (`ResearchForm`). Pressing **Research** is what spends, as ever; it stays on the page while
searching (up to a minute), then opens the results. The box sits beside a plain statement of what is sent to the
provider. Notes: the shared `RecentNotes` panel. Draft: the idea's drafts in their order (reordering stays on the Draft
step) and **Start a draft** (`StartDraftButton`, shared with the Draft step). A place is left for Refine (#101).

**Idea landing page, second round (#130, #101, #102).** Creating an idea opens its landing page. Research shows the
unread articles (the publication's `RecentReading`, filed under Research) while there is anything unread, and the
research box only when there is not, so the page offers the next likely move. Notes use `NoteCard`, shared with the Notes
step, so tags and origin show in both. Refine shows the latest AI message (cut at a paragraph after about 600
characters, with "Read in full") and a reply box. Sending from there is the same path as the Refine page: the text is
held in memory (`lib/pending-message.ts`, never in the address) and the Refine page sends it once its thread has
loaded, so the reply streams there and the missing-key message appears there. With no conversation the panel shows the
"Talk it through" invitation and **Start brainstorming** opens Refine, which starts it (`?start=1`). Visiting sends
nothing. The idea's name in the menu and above each step's title links to the landing page.

**Landing page look (#111).** The title is the publication's name with its picture and website beside it, not "Overview". Sections are numbered like the menu's steps, with a light rule above each (`LandingSection`, shared with the idea landing page). The publication's name in the menu, and above a step's title, links to the landing page; so does "← publication" in the idea menu.

**Landing pages, third round (#229).** Quick add (Home's tabbed panel) now also opens a publication's and an idea's landing page, so
adding something is one way in one place: the Read and Notes sections lost their own boxes and the Ideas section lost its
"New idea" button, and the sections are plain summaries like Search. Rejected: keeping a form per section (three different
form styles, and the page read as a stack of forms). The menu shows a count under every step that has something to count
(feeds, to read, notes, ideas), which costs one shared query each, fetched only at that level. A long publication name is
cut after two lines and the website is the word "Website" in the menu, because an address can be any length.
