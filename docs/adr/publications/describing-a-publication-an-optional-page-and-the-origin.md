# Describing a publication: an optional page, and the origin follows the words (#136, part of #27)

> **Removed in #150** (see _Publication descriptions are written by the writer_, at the end of this file). Kept as the record of why it was built.

The flow is its own page, `/p/:publicationId/describe` ("Describe this publication"). **The first thing on it is the box to write the
description in** (#146: the first version opened on a two-step flow that led with the post picker, which made drafting look like the
main path). Under the box is a **collapsed** section, "Draft from a few posts": the picker from #134 (the publication's recent posts
and/or pasted links, from this publication or similar ones), what is sent, and **Draft a description**. A draft fills the box, closes the
section and moves focus to the box, to read, change and use. A note says a draft replaces what is in the box when there is
something there. The page is reached from the publication page's next step and invitation, and from the publication settings, so it can be done later.

- **Opt-in from the publication page, not a step in the way.** The first plan put it between creating and arriving, then
  a second button beside "Create publication". Two buttons for one action was the wrong shape (#213): there is one
  **Create publication**, and the new publication's page ends with a "Describe this publication" next step until it has a
  description. Describing is optional, and a forced extra screen would have been the default for every publication.
- **Plain words about what is sent** sit above the picker: the text of the chosen posts goes to the writer's own
  provider, with their own key, only when **Draft a description** is pressed. Visiting costs nothing.
- **Marked as the AI's, with evidence, until accepted.** `DescriptionOrigin` shows the "AI draft" mark (the highlighter,
  which is for exactly this), the posts it was drawn from, and what has happened to it: not accepted yet (the assistant
  does not see it), accepted as it was, or edited. It appears on the draft review, the publication page and the settings.
  **Use this description** on an untouched draft calls `…/description/confirm`; with changes it saves them.
- **Origin follows the text, so edits keep the mark.** A person's changes to an AI draft no longer turn it into "their
  own words" (the #131/#135 behaviour): the origin stays `inferred`, the sources stay, and `description_edited` becomes
  true. Saving counts as accepting it. Clearing the description starts again from nothing (entered, no sources, not
  edited), and a new draft resets "edited". A description written from scratch is never marked.
- **Leaving without accepting** keeps the draft, unused. The publication page invites the writer to read it and decide.
