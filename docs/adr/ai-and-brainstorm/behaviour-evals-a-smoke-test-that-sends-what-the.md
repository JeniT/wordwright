# Behaviour evals: a smoke test that sends what the app sends

The responsible-AI boundaries ([responsible-ai.md](../../responsible-ai.md)) are mostly prompt-level, and models differ
on them, so they are spot-checked against the real model. **This is a smoke test, not assurance.** Each case is one
hand-written scenario, the model's reply varies from run to run, and a second model call grades it; showing that a model
reliably behaves a given way would take many runs over many scenarios, which is not feasible here. What the evals can do
is catch an obvious break after a prompt edit, show a gross difference between models, and give planned work a concrete
description. The guarantees are the structural tests, which are deterministic and free.

The harness (`evals/`) is built so that what is tested is what is sent: it imports the app's own prompt files, tool list,
system-prompt assembly and snapshot builder, and calls the model through our `LLMProvider` port, built by the app's
`realLlmFactory`. So it evaluates the adapter and the way the app drives it, not a vendor SDK, and a new adapter
registered in `llm-factory.ts` is evaluated with no change to the evals. promptfoo is used only to run and grade the cases
(pinned, with telemetry and sharing switched off, because the fixtures are writing).

Not in CI and not in `pnpm check`: they cost money, need the runner's own key, are nondeterministic, and rubrics are graded
by a second model call. How to run them, the two groups of cases, adapter checks and the structural tests are in
[evals.md](../../evals.md).
