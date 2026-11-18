# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: solo writers of argued nonfiction.** An individual who loves writing and publishes essays, opinion,
analysis or commentary in their own newsletter, blog or Substack: pieces that respond to what others have written and
make a case. They mostly work alone, sometimes asking a friend or editor to read a draft. Their job is to get from a
spark of an idea to a finished, published piece that is unmistakably in their own voice.

Secondary audiences, served by the same app:

- **Members** of a small publication who hand a draft between them (handover, reassignment). Team features exist but
  are secondary to the solo writer.
- **Reviewers**: people invited by email to read and comment on one draft, who may know nothing about Wordwright.
- **The admin**: approves accounts during the private alpha.

## Product Purpose

Wordwright supports a writer's whole journey: finding ideas, researching sources, shaping an argument and outline,
critiquing drafts without losing the author's voice, and helping with titles and openings. Success is **finished,
published writing**: the writer closing the tab and publishing, not time spent in the app.

How it is described, word for word (from `CONTEXT.md`):

- Short: “Wordwright helps people who love writing to do more of it.”
- Longer: “Wordwright helps spark ideas, research different perspectives, work out what to say, and improve your
  drafts, but it never writes your words for you.”

## Positioning

The AI **augments the writer and never substitutes for them.** It asks, reflects, critiques and offers alternatives
drawn from the writer's own text; it never originates text the writer would publish (the assistance ladder in
`docs/responsible-ai.md`; rung 5 is out of scope). Limits are the default, so the writer doesn't have to hold the
line themselves: critiques are rationed per draft, Rephrase needs a changed aim before another round, Research looks
for articles that disagree as well as agree, and there is no engagement design of any kind.

## Operating Context

- **Devices:** drafting and critique happen on a laptop or desktop; reading articles, taking notes and reviewing
  also happen on a phone. Every screen is checked at phone width.
- **The journey, as the app models it:** Home → a publication → an idea (one sentence in the writer's words) →
  its notes, articles, Refine conversations and drafts → critique, review and Rephrase → publish and export.
- **Bring your own key:** each writer uses their own LLM API key and pays their provider directly. The service has
  no server-wide key. Today the provider is Anthropic.
- **Outside the app:** writers publish on their own platform (Substack, a blog). Wordwright exports Markdown; it has
  no publishing integration, deliberately.
- **Private alpha:** accounts are approved by hand. The public site (`wordwright.io`) is separate from the app
  (`app.wordwright.io`).

## Capabilities and Constraints

- Built: accounts and sign-in (email and password, optional Google); publications with members, sharing,
  handover and human review of drafts; ideas with notes, articles from feeds, and an AI Research step; Refine (a
  conversation with your AI); Markdown-backed drafts with autosave, AI Critique, comments and Rephrase; export.
- Not built yet: social posts (#164).
- Terminology is fixed in `CONTEXT.md` (publication, idea, note, article, draft, editor, critique, review request…),
  with words to avoid. UI words follow `docs/style-guide.md`: British English, sentence case, “your AI”, no hype,
  no exclamation marks, no emoji.
- Every AI feature names its rung on the assistance ladder; AI-suggested material is labelled and its origin kept.
- Stack and engineering rules are in `README.md` and `AGENTS.md` (Vue 3 web app, Hono API, ports and adapters,
  strict TypeScript, Zod at every boundary).

## Brand Commitments

- **Name:** Wordwright.
- **Mark:** a flame whose tip is a split pen nib. It names the product only; never shown for a publication.
- **Voice:** plain, friendly, calm, like a good editor talking to a colleague. The app is a tool; the writer is the
  author. The AI is “your AI”, never “I”, and has no personality.
- **Look:** the existing **Ember** design system (`docs/design/`) is binding: calm and book-like, not busy.
- **Never:** hype words (“powerful”, “smart”, “AI-powered”), streaks, nudges, guilt, scores or progress that rewards use.

## Evidence on Hand

- Screenshots of the running app: `docs/screenshots/`.
- The owner's introductory blog post on `wordwright.io` (her words, unedited).
- The public page's agreed copy: `docs/landing-page.md`.
- **Absent, and not to be fabricated:** testimonials, user counts, customers, pricing, benchmarks, press.

## Product Principles

1. **Finishing is the goal.** Design for the writer to publish and leave; anything that can be re-run forever is
   limited.
2. **Writer first, then the AI.** The writer says their point, aim or angle before the AI responds to it.
3. **Options, never one answer.** Where the AI offers wording, it is a set drawn from the writer's text, picked and
   edited before use, with no one-click path out.
4. **Challenge, not flattery.** Critique ranks what matters and stops; Research seeks disagreement.
5. **Calm and obvious.** Content leads; it is always clear what can be pressed, and every async action explains its
   loading, empty and error states and what to do next.

## Accessibility & Inclusion

WCAG 2.2 AA: every screen is keyboard-usable and passes axe in the e2e suite; colour contrast is tested in light and
dark (`palette.test.ts`); colour is never the only signal; reduced motion is honoured; 16px minimum in fields.
Details in `docs/design/accessibility.md`.
