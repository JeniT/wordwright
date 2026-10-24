# Prompts do not vary by an explicit publication mode (#137, #25)

Decided by the owner: **no "writing mode" on the publication** ("for readers" or "to think in public") choosing between
brainstorm and critique prompt variants, and no per-publication prompt editing. How the AI treats a publication comes from the
writer's own description of it (#131, #133): the prompts tell the model to read it, so a publication described as personal
thinking is coached rather than edited, and is not asked for an audience or a wider appeal.

- **Why.** A mode is one more thing to set and to get wrong, a publication is often both kinds of writing, and the free-text
  description already carries the distinction, in the writer's words and visible to everyone in the publication. One set of
  prompts is also one set to evaluate and keep within `docs/responsible-ai.md`.
- **What this settles.** #25's open question (prompts that vary by publication) is answered: they don't, beyond the
  description. Per-publication prompt customisation ("a house style for each publication", `docs/brainstorming.md`) is not planned.
  The distress-handling rules (principle 9) are not a publication mode either: they apply to every conversation.
- **If it stops being enough.** The boundary evals added in #133 (a personal publication is not asked for an audience, a publication with
  readers is weighed against them) are what to watch; if real use shows the description alone is unreliable, the fix is
  to improve those prompts and cases first, and a mode would need a new decision.
