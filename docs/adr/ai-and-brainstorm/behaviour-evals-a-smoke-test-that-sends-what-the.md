# Behaviour evals: a smoke test that sends what the app sends

The responsible-AI boundaries (`docs/responsible-ai.md`) are mostly prompt-level, and models differ on them, so they
are spot-checked against the real model. **This is a smoke test, not assurance.** Each case is one hand-written
scenario, the model's reply varies from run to run, and a second model call grades it; showing that a model reliably
behaves a given way would take many runs over many scenarios, which is not feasible here. What the evals can do is
catch an obvious break after a prompt edit, show a gross difference between models, and give planned work a concrete
description. The guarantees are the structural tests (below), which are deterministic and free. The harness (`evals/`, `@wordwright/evals`) is built so that what is tested is what is
sent: it imports the app's own prompt files, tool list (`BRAINSTORM_TOOLS`), system-prompt assembly
(`brainstormSystem`) and snapshot builder (`formatSnapshot`), and calls the model through our `LLMProvider` port, built
by the app's `realLlmFactory`. So it evaluates the adapter and the way the app drives it, not a vendor SDK, and a new
adapter registered in `llm-factory.ts` is evaluated with no change to the evals. The cases are typed data in
`evals/src/cases.ts`; `pnpm eval` writes a promptfoo config from them (the only use of promptfoo, pinned, with its
telemetry and sharing switched off, because the fixtures are writing) and promptfoo runs them through a TypeScript
provider.

- **Not CI, not `pnpm check`.** They cost money, need a key (the project has no shared key; the person running them
  uses their own), are nondeterministic, and rubrics are graded by a second model call
  (`anthropic:messages:claude-sonnet-5-5` by default; `--grader` changes it, and it needs `ANTHROPIC_API_KEY`). The
  harness itself, the request builders and the config generator are unit-tested in `pnpm check`, with the fake adapter
  as a dry run (`--provider fake` needs no key, though rubrics can't then be graded).
- **Keys and trials.** Run in a terminal, `pnpm eval` asks for the API key with the typing hidden (unless
  `EVAL_API_KEY` is set), keeps it in memory, and hands it only to the eval process: it is never written to a file or
  printed. It also asks how many times to run each case (`--trials N` skips the question; 1 to 20, since each trial
  costs the same again) and prints a pass count per case. Without a terminal nothing is asked and a missing key is an
  error. No key should ever be typed into a chat with an agent.
- **Two groups.** `current` cases are behaviour the prompts already ask for, so a failure is a reason to look, not
  proof of a regression (rerun with more trials first). `targets`
  cases define work that is planned (#45 critique, #46 brainstorm wrap-up, #49 distress and flattery) and may fail
  until it lands; that issue promotes its cases. Writing them first makes the issue's definition of done concrete.
- **Structural boundaries are ordinary tests.** `brainstorm-boundaries.test.ts` fails if a tool gains a field that
  could name a draft, an id or a publication, if a planted field survives validation, if a draft could carry text into the
  snapshot, or if the person's prompt could displace the app's rules. Adding to a tool is allowed, but must be a
  decision: the allowed-inputs list in the test has to be edited with it.
- **Adapters.** Looking at a new LLM adapter now includes the contract suite (which must pass) and a run of
  `pnpm eval:adapter` with a few trials, with the summary pasted in the issue. The eval results are information for the
  owner, who decides: a case a weaker model fails is not an automatic veto, and a pass is not a guarantee.
- **Limits.** The cases were written without running them against a real model, so the first run may show a rubric
  that is too strict or too loose; tune the case, and say so in the commit. LLM-graded rubrics can flake: rerun a
  failure before believing it. The critique case calls `complete()` as the route does, so it does not use `chat()`.
