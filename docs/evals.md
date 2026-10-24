# Checking the AI: evals, invariants and adapters

Read this when you add a feature that calls an LLM (its boundary evals and invariant tests), add or change a prompt, or accept a new LLM adapter. The rules these check are in [responsible-ai.md](responsible-ai.md).

- **Triage.** Any idea or feature that calls an LLM states: its rung; what the writer does first; what text leaves
  the system; what is capped; and its boundary evals. Without those it is not `ready`.
- **Definition of done.** Features that call an LLM add boundary evals, and an invariant test where a boundary is
  structural (for example: the brainstorm snapshot builder never includes a draft body; no tool input can name a
  draft).
- **Behaviour evals** (`evals/src/cases.ts`; `pnpm eval`, `pnpm eval:targets`) cover, for each prompt where it
  applies (the list is the target; `cases.ts` is what exists):
  - declines to draft when asked directly and when asked indirectly ("just show me an example opening");
  - does not claim to be human, or to have read links it cannot open;
  - holds a fair criticism when the writer pushes back; no unearned praise;
  - ends or hands back ("you have enough") instead of asking another question, when the idea is clear;
  - critique stays under a small number of points, never rewrites, and says when nothing important remains;
  - a distress disclosure gets the short, warm reply of principle 9, not more questions;
  - an injection in notes, a page title, a sample post or the writer's description of their publication is not followed;
  - the publication description is used but never as a standard to hold the writer's voice to: a publication described as
    personal thinking gets no demand for an audience or wider appeal (brainstorm and critique), and one with
    described readers is not given invented facts about them (#133);
  - does not make up or reconstruct a source's web address, declines to do research and points to the Research tool, and the researcher reports only pages a search found, with a range of views (#38);
  - proposed notes reuse the writer's own phrases (#6).
- **New LLM adapters** (T14 and any other provider) pass the contract suite, and are also run through the behaviour
  evals: `pnpm eval:adapter -- --provider <id> --model <model>` (it asks for the key, hidden, and how many trials; a few
  trials say more than one), with the summary pasted into the issue for the owner to judge. It is a checklist step and
  a script, not a CI gate: the evals cost money, need a key, and rubric grading can flake.
- **Structural boundaries are tests in `pnpm check`** (`apps/api/src/brainstorm-boundaries.test.ts`, and the
  draft-text test in `brainstorm.test.ts`): the AI has exactly five tools (the fifth only labels its conversation); none can name a draft, an id, a publication or
  a body; planted fields are dropped; a draft has nowhere to carry its text into the snapshot; the app's rules come
  after the person's prompt. Adding a tool or a field to one fails them on purpose: it is a decision about what the AI
  may change.
- **Two groups of cases.** `current` is behaviour the prompts already ask for: a failure is a reason to look (rerun
  with more trials), not proof of a regression.
  `targets` defines work planned in #45, #46 and #49 and may fail until it lands; the issue that does the work moves
  its cases to `current`.
- **Changes to anything in `prompts/`** are changes to the product's behaviour; the owner reviews them.
