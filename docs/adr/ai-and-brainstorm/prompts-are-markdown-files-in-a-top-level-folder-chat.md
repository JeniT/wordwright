# Prompts are Markdown files in a top-level folder; `chat()` extends the LLM port

The AI's instructions are prose the owner wants to read and change, so they live in `prompts/` as plain `.md`
files (one per prompt, the whole file is the prompt, with a README saying what each is) rather than inside TypeScript
strings or config. They are read at startup by a small `@wordwright/prompts` workspace package, and the evals read the
same files, so what is tested is what is sent. (If the API is ever compiled instead of run with `tsx`, the `.md`
files must travel with it.)

The `LLMProvider` port gained `chat()` for conversations with tools, in our own types (content blocks, tools as JSON
Schema built from Zod, `text`/`tool_call`/`done` events with a stop reason and usage) so another provider can be
added without touching callers. Choices: no temperature or other sampling options (current Claude models reject
non-default values); reasoning blocks are not represented, so they are never stored or replayed; a reply cut off at
the token limit reports no tool calls (their input may be half-written); provider errors become `LLMAuthError`,
`LLMRateLimitError` and `LLMProviderError` whose messages never include what was sent, since requests hold people's
writing. `complete()`/`stream()` now translate errors the same way, so a non-auth failure is an `LLMProviderError`
(with the SDK error as its `cause`) rather than the raw SDK error.
