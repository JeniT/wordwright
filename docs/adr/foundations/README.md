# Decisions: foundations

Read this when you change architecture, stack, ports, bring-your-own-key, test rules, how we land changes. One file per decision; the title says what was decided. Open the ones that touch your change.

- [Client/server rather than a browser-only app](clientserver-rather-than-a-browser-only-app.md)
- [TypeScript monorepo; Hono + SQLite (`node:sqlite`); Vue 3 + Tiptap + Tailwind](typescript-monorepo-hono-sqlite-nodesqlite-vue-3-tiptap-tailwind.md)
- [Ports and adapters for every external service](ports-and-adapters-for-every-external-service.md)
- [Users bring their own LLM key; no server-wide key](users-bring-their-own-llm-key-no-server-wide-key.md)
- [Tests must fail on browser errors](tests-must-fail-on-browser-errors.md)
- [Validation errors answer `{ error: "message" }`](validation-errors-answer-error-message.md)
- [The working name "lfwa" is gone (#178)](the-working-name-lfwa-is-gone.md)
- [Landing: CI on `main` is the final gate, not a retest after every rebase (#220)](landing-ci-on-main-is-the-final-gate-not.md)
