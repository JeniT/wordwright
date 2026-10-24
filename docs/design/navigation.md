# Navigation: the menu follows you

Part of the [design system](README.md). Read this when adding a page, a step or a menu item, or changing the side menu.

## Navigation: the menu follows you

How people are led through the app. The side menu **follows you**: what it lists depends on where you are, with a way
back up and the name of the thing you are in. (We drew three approaches, a steady menu with steps on the page and a
menu-as-a-map tree among them; this one won. See [the decision](../adr/visual-design-and-navigation/navigation-the-menu-follows-you.md).)

| Level                | You are choosing…                            | The menu lists                                                                                                                                                             | Settings (a gear button)                                                                |
| -------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Home                 | which **publication** to work on             | Publications                                                                                                                                                               | Beside your name in the menu foot                                                       |
| Publication          | what to gather                               | **01 Scan** (recent posts), **02 Read** (the articles), **03 Note**                                                                                                        | Beside the publication's name, in the menu and on its landing page                      |
| Account              | which **setting** to change                  | **Your details**, **Your AI**, **Display**, **Sign-in and security**, **Download your writing**, **Delete account** (plain links, no numbers; way up "← All publications") | The gear in the menu foot, current across the whole group                               |
| Publication settings | which **setting** of a publication to change | **Details** (owners only), **Description**, **Feeds**, **Sharing**, **Download**, **Delete publication** (owners only; plain links, no numbers; way up "← {publication}")  | The gear beside the menu's "Publication settings" label, current across the whole group |
| Idea                 | how to develop it                            | **01 Research** (the AI research tool), **02 Read** (the idea's own articles), **03 Note**, **04 Refine** (brainstorm), **05 Draft**                                       | Beside the idea's name, in the menu and on its landing page                             |

**Home with a publication.** Top to bottom; a section with nothing to show isn't drawn and leaves no gap: **Drafts to review**,
**Quick add**, **Keep writing**, then the publications. (Quick add and Keep writing sit together at the top of a publication's and an idea's landing page too, Quick add first; Quick add there is the same panel, with the place fixed and so no picker; on an idea's it has no New idea tab. **An article's page** uses it too, for taking notes from that item: Add a note comes first, with the quotation tick; Add article says which item it added and links to it; New idea comes last, on a publication's item only.) _Quick add_ is "Add:" then three tabs (**Idea**, **Note**, **Article**; a screen reader hears New idea, Add a note, Add article) with no visible title (the section and the tab list are still named "Quick add" for a screen reader), each showing one small form. **New idea**
is showing on arrival, every time, so there is always a form and no Cancel. A publication picker
sits inside the form that is showing, above its field, and only when there is more than one; it starts at the publication last worked in (saved in `localStorage` when a
publication page opens or one is chosen here), else the one with the first draft to keep writing, else the first. A note or article goes to the publication's own list, never
into an idea, and the form says where it went and stays open for the next. _Keep writing_ lists the drafts the person edits that are active
(`GET /api/drafts/active`): saved in the last 30 days, or with a review in progress, or with comments they haven't resolved,
those with unresolved comments first. It starts with three; **Show more** adds three below them and moves focus to the first new
row. It is on Home (all their publications), a publication's landing page (that publication) and an idea's (that idea), and is
not drawn when nothing is active. A row is a `DraftRow`, the same one the idea's Draft page uses: the whole row is the link (no
"Continue"), with the title, then what the page doesn't already say about where it is (idea and publication on Home, the idea on a
publication's page, nothing on an idea's) and "Last changed", then how its reviews stand over all its requests ("2 of 5 reviews
complete · 4 unresolved comments"). The Draft page adds the editor as a name chip (`PersonChip`, as on a note) to every row,
the person's own included; Keep writing never does, as they are all theirs.

**First run (Home).** While a person has no publication or no AI key, the top of Home is a two-item checklist using the
same 01 / 02 badges: **01 Create your first publication** and **02 Connect your AI key (Anthropic)**. Neither blocks the
other. A finished step keeps its place with a tick in the badge and "done"; when both are done the checklist goes and the
list of publications stands alone. The heading is "Get started" and the action is the same "New publication" as beside the list (which shows only once there is a publication). What a publication is sits behind an info icon (`Explain`); body text in both steps is the same size and colour. While there
is no publication the list's own heading row and button are not shown (the heading stays as a screen-reader-only `h1`
that names the page); they appear once there is one. The pattern for any first-run block: one heading that says what it
is, no greeting, one name per action, and explanations behind `Explain`. The badges stay decoration (`aria-hidden`); the ordered list carries the order.

The principles (they are the point of the pattern; keep them when you add a page):

1. **Numbers orient; they never gate.** Every step is a link, always enabled. Nothing is locked, greyed out or
   "completed for you". The numbers are decoration (`aria-hidden`); an ordered list conveys the order.
2. **State is a count, not progress**: "2 feeds", "3 to read", "5 notes", "1 idea" under each of a publication's steps, and "2 sources", "5 notes", "1 draft" under an idea's (Refine has nothing to count). No progress bars.
   In the menu a long name is cut after two lines, and the website is always the words "Website" with the new-tab icon, never the address.
3. **See where you are in two places**: the current step is marked in the menu (`aria-current`, a filled badge and an
   edge) and in the page title, with the publication or idea name above it (`StepHeading`).
4. **A suggestion, not a push.** A step ends with `NextStep` ("Next: 04 Refine →"), an outline button, never the
   primary one. A step where the next move is a choice (Ideas), or the last (Draft), has none.
   **Steps are named with verbs** (Scan, Read, Note, Refine, Draft), because the page is something you do. The rule covers numbered steps only: settings pages and a publication's Ideas list name things.
5. **Visiting spends nothing.** A step that calls the AI waits for a button (Refine's **Refine with your AI**,
   the Research page's Research button); arriving by the menu must never cost the writer money.
6. **Always a way up**: "← All publications", "← {publication}".
7. **Settings sit apart from the steps**, at their own level, with no step current. They are reached by one **icon-only
   gear button** (`SettingsButton`: a link, 44px square, named "Account settings", "Publication settings" or "Idea
   settings", with the same words as its tooltip) placed beside the name of the thing it configures, never a text link
   in the list of steps. It is the same gear at every level; its name and its place say which. It is marked current
   (`aria-current`, `accent-wash`) on its own page. The **menu foot** holds your name (plain text) with the account
   gear, and a **Sign out** button (an action, so a button, not a link). Appearance is a setting, so it lives on the
   Display page. **Account settings are six short pages, not one long one** (`/account/details`, `/ai`, `/display`,
   `/security`, `/download`, `/delete`; `/account` redirects to the first), under an `account` level whose menu is
   plain links with no numbers, because settings are not a sequence. Each page is titled with `StepHeading` ("Account
   settings" is the small link above the title) and has no `NextStep`. A new setting goes on the page it belongs to; add a
   page only if none fits (`ACCOUNT_PAGES` in `lib/nav.ts`, plus a route with `meta: { level: 'account', step }`).
   **A publication's settings work the same way**, under a `publication-settings` level: **Details** (name, website,
   picture), **Description**, **Feeds**, **Sharing**, **Download** and **Delete publication** (`/p/:id/settings/details`, `/description`,
   `/sharing`, `/download`, `/delete`; `/p/:id/settings` redirects to the first the person can see: Details and Delete are for owners, so a member starts at Description). The menu's way up is "← {publication}"
   and its pages are plain links with no numbers (`PUBLICATION_SETTINGS_PAGES`; routes use
   `meta: { level: 'publication-settings', step }`). A member's menu leaves out Delete, and its address sends them to
   Details. The name and website fields are one component (`PublicationDetailsFields`) shared with New publication, so the two forms
   can't drift apart. **An idea's settings are one page, not a menu**, because it has only a name and a delete (`/p/:id/ideas/:id/settings`, under the `idea` level): its Save button reads "Save idea" and swaps to "Saving…" as Details does, "Saved" sits underneath, and its delete box, like the others, leads with "Download your writing" first.
8. **A level has a landing page** (a publication's, at `/p/:publicationId`; an idea's, at `/p/:publicationId/ideas/:id`) that is none of the numbered steps: a summary of
   each step (the newest feed posts; the first items to read; the latest notes; the ideas), with **Quick add** above them for adding an idea, a note or something to read, so the sections hold no forms of their own. Nothing in the menu is current there.
   The title row has the gear at its far end. **Describe this publication**, while there is no description, is a `NextStep top` right under the title row, and the publication's description comes next, then Quick add.
   Panels reuse the step pages' components, and, like the steps, visiting spends nothing. The page is titled with the
   publication's name (`h1`) beside its picture and website link, then the publication's description (Markdown, clamped to about eight lines with a
   **Show more…** / **Show less** button that appears only when text is hidden; an invitation to add one when empty); each section is a `LandingSection`: the step's number
   (from the same list as the menu) and title, with a light rule above to set it apart, and its "See all" and quick
   actions on the right of the heading. An idea's page is titled with the idea's name (the publication above it, as a way
   up), has Quick add (Add a note, Add article: no New idea, and they go to the idea) and summarises Research (the box to ask the AI, which waits for
   its button, and a link to the research so far), Read (the unread articles, as on a publication's page), Notes (shown by the same `NoteCard` as the Note step), Refine (the AI's latest message and a box to
   reply, or **Refine with your AI** with a line on what is sent) and Draft (its drafts, and **New draft**).
9. **The name leads back up to the landing page**: the publication's or idea's name in the menu, and the small name above
   a step's title, are links to it (current on the landing page itself, where the title is not a link).

|                                                              |                                                                      |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| ![Idea, Research step](../screenshots/nav-idea-research.png) | ![Publication, Ideas step](../screenshots/nav-publication-ideas.png) |
| ![Phone, menu open](../screenshots/nav-phone-menu-open.png)  |                                                                      |

**How a page joins the menu.** Give its route `meta: { level: 'publication' | 'idea' | 'account', step: '<key>' }` in `router.ts`
(`step` is a key from `PUBLICATION_STEPS`/`IDEA_STEPS` in `lib/nav.ts`; leave it off for settings). Sub-pages of a step
(the research tool, reading one source) use their step's key, so it stays current. The title is
`<StepHeading>Name</StepHeading>`; end the page with `<NextStep :to label>why this is next</NextStep>`. A page that is
read beside another window (reading a source, taking notes) adds `compact: true`, which folds the menu behind the
**Menu** button at every width so two windows fit side by side. The drafting page keeps the menu on a laptop and finds
its idea from the draft (`ideaFromDraft: true`).

Adding a step (rare): add it to the step list in `lib/nav.ts`, give its route the meta, and update the table above
and in README. Renumbering is automatic.

**Publishing is not a step.** It is done to one draft, so it sits at the bottom of the Draft page (`DraftPublish`): **Copy**
(rich text, with plain text beside it, so it keeps its headings and links when pasted into an editor or an email) and
**Copy as Markdown** (title first), with a text box to select from if the clipboard is out of reach. Publishing straight to
a newsletter, and help drafting social threads, would add their own buttons there later; neither is built. Below them the
editor says when they have published it: a **switch** "I’ve published this draft" (a state, saved at once), and, once it is
on, the `chip-ok` "Published Oct 20, 2026" (with a tick) and an optional **Link to the published post** (only `http:` and `https:` are accepted; it opens in a new tab and the service never
fetches it). Once there is a link the form folds away: the chip is followed by "View post" and an edit icon button that opens the form again (Save or Escape closes it and focus returns to the button). Everyone who can read the draft sees the chip and link, but only the editor sees the switch. Marking a draft published
takes it out of Keep writing, whatever else is true of it. On the idea's **Draft** page (`IdeaDraftsView`, rows are `DraftRow`s) a
published draft **keeps its place**, since the order is the reading order for a linked set. Its row is washed `ok-wash`, with the
same chip, and "View post" is its own link beside the row link (a link can't be inside one). There is no animation: the achievement
is the colour, and the row staying as a record. The text-on-wash pairs are in `palette.test.ts`. The old
`/ideas/:id/publish` address redirects to the idea's drafts, and the drafts list is the last step, with no next step.
