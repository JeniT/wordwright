# Decisions and rationale

Short records of non-obvious choices, so they don't get re-litigated or forgotten. One file per decision, grouped by
area. **Open the area's index, then only the decisions that touch your change.**

| Read when you change…                                                                                      | Folder                                                                  |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Architecture, stack, ports, bring-your-own-key, test rules, how we land changes                            | [foundations/](foundations/README.md)                                   |
| Sessions, passwords, email, linking, deleting an account, where you are signed in                          | [accounts-and-security/](accounts-and-security/README.md)               |
| Invitations to a publication: who can send them, decline or block                                          | [sharing/](sharing/README.md)                                           |
| Publications: ids, pictures and icons, the description, settings pages, moving things between publications | [publications/](publications/README.md)                                 |
| Drafts: belonging to an idea, saving, publishing, export, the editor toolbar                               | [drafts-and-editing/](drafts-and-editing/README.md)                     |
| Notes and articles: origin, tags, quotations, merging, who wrote what, notes beside the draft              | [notes-and-articles/](notes-and-articles/README.md)                     |
| The AI: prompts, the Refine conversation, keys and models, behaviour evals                                 | [ai-and-brainstorm/](ai-and-brainstorm/README.md)                       |
| Ember, navigation, controls, icons and how interactions behave                                             | [visual-design-and-navigation/](visual-design-and-navigation/README.md) |
| Feeds, the Scan and Research steps, and fetching other websites safely                                     | [research-and-feeds/](research-and-feeds/README.md)                     |
| Critique points, comments, human review, handover, and what is waiting on you                              | [review-and-comments/](review-and-comments/README.md)                   |
| Rephrase: options for a passage or title, and its limits                                                   | [rephrase/](rephrase/README.md)                                         |
| Tutorial mode, and the wording of particular pages                                                         | [wording-and-tutorial/](wording-and-tutorial/README.md)                 |
| Hosting, production, backups, and the private alpha                                                        | [go-live-and-operations/](go-live-and-operations/README.md)             |

## Adding a decision

Write `docs/adr/<area>/<short-slug>.md` (a slug, not a number, so two sessions never collide) with the title as a
heading, then **Decision → Why → Consequences/alternatives**, and add one line for it to the area's `README.md`. If no
area fits, start a new folder with its own `README.md` and add a row above. When a decision replaces an earlier one,
say so in both files.
