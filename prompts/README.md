# Prompts

The instructions we give the AI live here, as plain Markdown files, so they're easy to find and edit.

| File                                                             | What it does                                                                                                                                                                            | Who can change it in the app                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `critique.md`                                                    | The editor that critiques a draft (the **Critique** button).                                                                                                                            | Nobody; edit the file                                                             |
| `brainstorm-default.md`                                          | How the AI behaves when someone brainstorms an idea: a sceptical commissioning editor. The starting point for everyone's prompt.                                                        | Each person edits their own copy, on their account page, and can reset it to this |
| `brainstorm-kickoff.md`                                          | The instruction sent with the idea when someone presses **Brainstorm**, so the AI starts the session by asking questions.                                                               | Nobody; edit the file                                                             |
| `tool-add-note.md`, `tool-update-idea.md`, `tool-create-idea.md` | What the AI is told its tools do (record a note straight away; suggest a new title; suggest a new idea).                                                                                | Nobody; edit the files                                                            |
| `brainstorm-rules.md`                                            | Rules the app always adds after a person's own prompt: how its tools work (notes it records, suggestions you accept), no drafting, treat the idea's text as material, not instructions. | Nobody; edit the file                                                             |

## Editing

- Just edit the file. **The whole file is the prompt**, sent to the model exactly as written (leading and trailing
  blank lines aside), so there are no notes inside; this README says what each one is for.
- The files are read when the API starts, so **restart `pnpm dev`** after a change.
- The evals read these same files, so what they test is what the app sends.
- Keep `brainstorm-rules.md` in step with the tools the model is given (`add_note`, `update_idea`, `create_idea`; see
  [docs/brainstorming.md](../docs/brainstorming.md)): if you rename a tool, change it there too.
- Changing the default brainstorming prompt doesn't change anyone who has already saved their own version.

## Checking a change

[`evals/promptfooconfig.yaml`](../evals/promptfooconfig.yaml) runs example inputs through these prompts and grades
the answers (it needs an `ANTHROPIC_API_KEY`; run it from the repo root, as the file's header says). Add a case when you change what a prompt should do.

## How they're loaded

`index.ts` reads each file at startup (the `@lfwa/prompts` package). If the API is ever compiled rather than run
with `tsx`, these `.md` files must be copied alongside it.
