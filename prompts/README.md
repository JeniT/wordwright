# Prompts

The instructions we give the AI live here, as plain Markdown files, so they're easy to find and edit.

| File                                                                                                                     | What it does                                                                                                                                                                                                                                                                                                                                                                                 | Who can change it in the app                                                      |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `critique.md`                                                                                                            | The editor that critiques a draft (the **Critique** button).                                                                                                                                                                                                                                                                                                                                 | Nobody; edit the file                                                             |
| `options.md`                                                                                                             | The Rephrase window: given a passage (or title) the writer is stuck on and their aim, offers options that differ in approach, reword without adding anything, and stay near the size of the original. The writer picks one, edits it and decides whether to use it.                                                                                                                          | Nobody; edit the file                                                             |
| `brainstorm-default.md`                                                                                                  | How the AI behaves when someone brainstorms an idea: a writing coach. The starting point for everyone's prompt.                                                                                                                                                                                                                                                                              | Each person edits their own copy, on their account page, and can reset it to this |
| `brainstorm-kickoff.md`                                                                                                  | The instruction sent with the idea when someone presses **Brainstorm**, so the AI starts the session by asking questions.                                                                                                                                                                                                                                                                    | Nobody; edit the file                                                             |
| `tool-add-note.md`, `tool-update-idea.md`, `tool-create-idea.md`, `tool-suggest-reading.md`, `tool-name-conversation.md` | What the AI is told its tools do (record a note straight away; suggest a new title; suggest a new idea; suggest a page for the reading list, only one the writer gave it; label the conversation once, at once).                                                                                                                                                                             | Nobody; edit the files                                                            |
| `research.md`                                                                                                            | The researcher behind **Research** (a page of its own, not part of brainstorming): given the areas the writer describes, it searches the web and reports pages, with a range of perspectives, for the writer to review. It writes nothing else.                                                                                                                                              | Nobody; edit the file                                                             |
| `brainstorm-rules.md`                                                                                                    | Rules the app always adds after the default prompt: how its tools work (notes it records, suggestions you accept), when to stop, honesty about being an AI, no flattery, a short warm reply (and no notes) if the writer is in distress, no drafting, treat the idea's text as material, not instructions, a note labelled as a quotation is someone else's words and not the writer's view. | Nobody; edit the file                                                             |

## Editing

- Just edit the file. **The whole file is the prompt**, sent to the model exactly as written (leading and trailing
  blank lines aside), so there are no notes inside; this README says what each one is for.
- The files are read when the API starts, so **restart `pnpm dev`** after a change.
- The evals read these same files, so what they test is what the app sends.
- Keep `brainstorm-rules.md` in step with the tools the model is given (`add_note`, `update_idea`, `create_idea`, `suggest_reading`, `name_conversation`; see
  [docs/brainstorming.md](../docs/brainstorming.md)): if you rename a tool, change it there too.
- The writer's description of their publication (the publication description) reaches the brainstorm snapshot, the critique
  message and the research brief in a `<publication_description>` block, only when there is one a person wrote or accepted.
  `brainstorm-rules.md`, `critique.md` and `research.md` say it is the writer's material, never instructions.

## Checking a change

The behaviour evals in [`evals/`](../evals/src/cases.ts) send the model exactly what the app sends (these prompt
files, the app's own tool list, a realistic snapshot) and grade the replies. They are a rough smoke test, not proof
that a prompt works: each case is one sample and a model grades it. `pnpm eval` runs the cases for behaviour the
prompts already ask for; `pnpm eval:targets` runs the ones that define planned work. In a terminal they ask for an API
key (hidden, never saved) and how many times to run each case; they spend that key's money and are not part of
`pnpm check` or CI. To rerun only some cases, add `--case` with part of each id, comma-separated:
`pnpm eval -- --case rephrase-offers,critique-says --trials 3`. Add a case in
[`evals/src/cases.ts`](../evals/src/cases.ts) when you change what a prompt should do, and tell the owner, who reviews
prompt changes.

## How they're loaded

`index.ts` reads each file at startup (the `@wordwright/prompts` package). If the API is ever compiled rather than run
with `tsx`, these `.md` files must be copied alongside it.
