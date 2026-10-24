# Page wording: what each page says, and why (#202, #203, #232, #283, #288, #291, #341)

The words themselves are in the code and its tests; this records the reasons and the options turned down.

- **Every page follows the same pattern.** A tutorial-only page line and one `Explain` per step, shown only in tutorial mode
  (the route has `meta.tutorial`), and no explanation paragraphs on the page ([Tutorial mode](tutorial-mode.md)). What leaves
  the system stays beside each AI button as one line ("This will send … to your AI. It will not send your drafts."), in a
  shared component so the landing page, Research and Refine say the same. Refine says it again beside **Send**, because an
  idea changed since the last message goes with the next one.
- **The AI is "Your AI", never "Coach".** The prompts still call it a writing coach; that is the AI's own instruction, not
  what people read, and any change to it is the owner's to review. **New draft** is the one name for starting a draft;
  **Refine with your AI** the one for starting a conversation (the AI speaks first). Counts are in the menu, not in the links.
- **Research: one run at a time (#202).** Newest first, with **Earlier research** and **Later research** (the owner's choice
  over paging inside a run: runs are short, and a run is the unit people think in). The results list is laid out like the Scan
  page's, with icon buttons (**Add article**, **Ignore**, and an undo that says **Take off the articles** or **Stop
  ignoring**). The AI's reason is highlighted, with one highlighted line explaining the highlight (shown only while a page is
  waiting), so neither "unchecked" nor a label on each row is needed. The model's name and "The search called it" went because
  neither changes what the writer does.
- **Refine (#283, #288).** There is one way on, **Next: 05 Draft**; the "I have enough" button went. A reply that fails is a
  callout with an icon: a missing key links to **Add your AI key**, and a key the provider refused says so and links to the
  key settings. A suggested page shows the AI's reason in the highlighter and does not repeat the title the AI gave it.
- **Drafts (#203).** What a button sends is said beside it (**Critique**: the publication's description and this draft's title
  and text, not the notes; **Generate options** in the Rephrase window: the same plus the writer's words and aim). The Rephrase
  window does not say that opening it again starts afresh: the limit is a UI limit ([responsible-ai.md](../../responsible-ai.md)),
  and the page need not advertise the way round it. **Look** (Critique) and **Round** (Rephrase) are separate words in
  CONTEXT.md. "Putting a note back doesn't remove its words from the draft" stays on the page, since without it people expect
  the words to leave.
- **Handover and review panels (#291).** **Snapshot** is the word everywhere people read; "copy" is gone. What a reviewer reads
  and who sees their comments stay on the page ([reviews are of snapshots](../review-and-comments/reviews-are-of-snapshots.md)
  requires the editor be told), with "your AI never receives them". Closing is "Close review: {name}" and "Close all
  reviews", never "stop accepting", so the visible label is in the accessible name. A closed review can't be reopened, and
  the page says so. Reassigning says it takes effect at once without asking the current editor. The history disclosure is
  "Handover history", since it lists offers and requests, not edits.
- **The provenance panel is hidden (#341).** "Where some of the words came from" is no longer on the draft page. The
  `draft_insertions` record and its API stay, so it can be shown again; principle 5 of
  [responsible-ai.md](../../responsible-ai.md) says so. Critique's privacy note sits beside its button, and the looks count is
  its hint text below the row.
