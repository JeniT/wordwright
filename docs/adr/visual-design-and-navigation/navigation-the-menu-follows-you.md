# Navigation: the menu follows you

**Decision.** The side menu **follows you** through three levels: Home (Publications), a publication (**01
Search**, **02 Read**, **03 Notes**, **04 Ideas**) and an idea (**01 Research**, **02 Read**, **03 Notes**, **04 Refine**,
**05 Draft**; settings at every level are one gear button beside the name (#180), not a menu item; **05 Publish** was a step until #97). The long Idea page was split into those steps, each its own page. How it
works and how to extend it is in [design](../../design/navigation.md#navigation-the-menu-follows-you); the mock-ups we compared, with
screenshots, are in [design-concepts/navigation/](../../design-concepts/navigation/README.md).

**What we wanted.** Lead people through the work without being a wizard: numbers on steps to orient, nothing locked,
a calm page instead of one long scroll, and a clear way to choose what to work on next at each level.

**Options considered.**

| Option                              | What it was                                                                                       | Outcome and reason                                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. The menu follows you** (taken) | The left menu changes with the level and lists its numbered steps, with a "← parent" link on top. | The owner leaned this way and it won: the calmest, the numerals are never ambiguous (only one level's numbers on screen), it needs no second navigation on the page, and on a phone the menu _is_ the step list. |
| B. Steady menu, steps on the page   | The menu never changes; a breadcrumb and a numbered step strip sit under each page title.         | Rejected: two navigation systems at once, taller page chrome, tab-like (the owner leaned away from tabs), and on a phone the strip scrolls sideways so later steps can be off-screen.                            |
| C. The menu is a map                | One tree shows publications, steps, ideas and the idea's steps together.                          | Rejected: the busiest and least calm, grows with the number of ideas, repeats "01, 02…" at two levels in one list, and is a long scroll on a phone. It solves rapid switching, which no one has asked for.       |

**Choices the owner made along the way.**

- **Notes** at publication level are gathered and, when a group becomes an idea, they **appear in** the idea (moved, not
  copied). That arrived with T37d (**Move notes** on the publication's Notes step); the menu needed no change for it.
- **The idea’s list of articles is separate from the publication's** (as the data already was). The publication's articles lives
  in Read (step 02); the idea's in Research (step 01).
- **Publish** was for getting a finished draft out; see _Publishing moved to the Draft page_ below (#97).
- **The menu stays on the editor** on a laptop or desktop, but **folds away on the reading and note-taking page**, where
  the writer has the source and the app side by side in narrow windows.

**Choices we made.**

- **Visiting a step never spends money.** Opening Refine used to start a conversation with the AI at once (the old
  Brainstorm button); now Refine opens a page with **Start brainstorming**, as Research has **Start research**.
- **No "complete" ticks and no locked steps.** State is shown as counts (sources, drafts, ideas). We have no way to
  know a step is "done", and claiming so would be prescriptive.
- **A publication opens on Ideas, and an idea on Notes**, the choice of what to work on next, and the thing a new idea
  starts with. Old addresses (`/p/<id>`, `/p/<id>/ideas/<idea>`, `/p/<id>/reading`, `…/brainstorm`) redirect.
- **The numbers are decoration for screen readers** (an ordered list says the order), so the step names are the
  accessible names and tests find links by them.

**Trade-offs.** The menu's content changes between levels, so the "← parent" link has to stay obvious; switching from one
idea to another means going up a level (an idea switcher under the idea's name is the likely fix if that proves
annoying). Several e2e specs had to change because they found links by names ("Brainstorm", "Research", "Settings")
that are now step names in the menu.

**Revisit if** people with many ideas find going up a level to switch tiresome (add an idea switcher, or reconsider the
map).
