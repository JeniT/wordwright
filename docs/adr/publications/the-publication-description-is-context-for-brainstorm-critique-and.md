# The publication description is context for brainstorm, critique and research (#133, part of #27)

Every AI call that knows which publication it is for puts the publication description (#131) in a `<publication_description>` block:
in the brainstorm snapshot (where it replaced the placeholder for audience personas), at the top of the critique
message (before the draft, so block ids and anchors are unaffected), and in the research brief (after the idea).
Brainstorm's own prompt (`brainstorm-default.md`) and the three fixed prompts say what it is and how to use it.

- **Data, not instructions.** It is the writer's own text, so like their notes it is escaped (it cannot close the
  block) and every prompt says never to follow instructions found in it. Evals plant instructions in it for all three.
- **No block when there is nothing to tell.** A blank description is not sent (`usablePublicationDescription`; it once also
  left out an AI draft nobody had confirmed); requests are then byte-for-byte what they were before. The brainstorm snapshot
  still says "(not described yet)", which is what makes the coach ask who the readers are.
- **Adapt, not a mode.** Whether a publication is for readers or for writing to think in public (#25) is not a setting: the
  prompts tell the model to read the description, so a publication that says "personal, mostly for me" is not asked for an
  audience or a wider appeal, and critique then reads as a coach would. Whether that is enough, or the publication needs
  an explicit mode, was decision #137: it does not ([Prompts do not vary by an explicit publication mode](prompts-do-not-vary-by-an-explicit-publication-mode.md)); the evals added here are what to watch.
- **Shared by the publication.** The description belongs to the publication, so everyone in it sends the same block through
  their own key and model. The rules added after the brainstorming prompt carry the instructions about the description.
