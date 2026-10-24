# An AI draft of the publication description: reflect, label, confirm (#135, part of #27)

> **Removed in #150** (see _Publication descriptions are written by the writer_, at the end of this file). Kept as the record of why it was built.

`POST /api/publications/:id/publication/description` (`{ urls, replace? }`, any member, with their own key) drafts the publication
description from 1 to 5 sample posts (#134). **Rung 2: it reflects** what the posts show and the writer then reads,
edits and confirms it; it never writes what will be published (`prompts/publication-description.md` forbids slogans,
taglines, bios, advice and writing for the publication). Nothing is spent until the button is pressed.

- **The server reads the posts itself** from the addresses, rather than being sent text: the evidence stored with the
  draft (`description_sources`) is then exactly what the model saw, and a client can't attach a claim to a link it
  didn't read. Posts that can't be read are dropped and reported (`skipped`); none readable is a 422 and no AI call.
- **Saved as a draft**: origin `inferred`, `description_confirmed = 0`, the addresses as sources. Until confirmed
  (`POST …/description/confirm`) it is shown to the writer but never sent to any model (#133: a test proves the
  brainstorm snapshot omits it, then includes it after confirming). Confirming keeps `inferred` and the sources, so the
  AI origin stays visible. (Changed in #136: a person's changes to a draft no longer make it "theirs"; see below.)
- **Not overwriting** someone's own words: a publication whose description was written by a person answers 409 unless
  `replace: true`. A draft over an earlier draft needs no confirmation.
- **Capped**: 5 drafts an hour per publication, on top of the shared per-person allowance for fetching posts, so the way
  to a better description is to edit it, not to re-roll. A reply that is empty or over 5000 characters is refused and
  nothing is saved.
- **What leaves the system**: the fetched text of the chosen posts (up to 8000 characters each), to the writer's own
  provider. **Boundary evals** (`evals/`): describes only what the posts show; says when evidence is thin; no
  demographic guesses about readers; says when posts differ; ignores instructions planted in a post.
