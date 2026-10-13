# Responsible AI: how this service uses an LLM

This service exists to **augment someone who wants to write**, not to substitute for them, and not to add
AI-generated text to the information environment. This page makes that aim concrete so it can be applied to every
feature, and checked in triage and review. It is a design principle, as binding as the three priorities in
[AGENTS.md](../AGENTS.md). Where it conflicts with convenience or engagement, it wins.

It covers four risks:

- **Substitution**: the AI writes, and the person edits or approves.
- **Cognitive offloading**: the person stops doing the thinking (the angle, the judgement, the revising) because the
  tool will do it, or will always find something more to do.
- **Emotional reliance**: the tool becomes a companion or an approver.
- **Propagation**: AI-originated text, claims or framings leave the system and reach readers.

## The principles

### 1. Finishing is the goal: no engagement design

The point of the tool is to get the writer to **publish**. Success is the writer closing the tab and writing, or
hitting publish, not session length, message count or return visits. So:

- **No streaks, nudges, notifications, "one more question" endings, scores or progress bars that reward use.** Do not
  add usage analytics that treat more AI use as better.
- **The assistant must be able to say "that's enough".** A brainstorm ends when the idea is clear enough to start
  drafting, and the assistant says so rather than inventing another question. It asks the one question that matters
  most, not always one more. (The default prompt's "keep asking questions that draw out more" is the wrong default;
  see _Open work_.)
- **Critique is rationed.** An LLM critic will _always_ find something to tweak, and each round of tweaking pushes the
  text further from the writer's voice and further from done. So:
  - Each draft gets a **small, fixed number of critique rounds** (default 3, which the owner chose; each writer can change it from 1 to 5 in their account settings).
    When they are used up the button says so, plainly and kindly: you have had your looks; the next step is to
    publish. The count is per draft, shown before the button is pressed ("2 of 3 looks used"), and is not reset by
    trivial edits. What counts as a new draft (and whether a heavy rewrite earns more looks) is a decision, not a
    default: see #103.
  - A critique **ranks and stops**: the few things that matter most, and an explicit statement when nothing
    important remains ("this is ready; what is left is taste"). It must never pad to look thorough.
  - The same applies to anything else that can be re-run indefinitely: "more options" for titles or openings is
    capped too (see 4).
- **Rate limits for cost are not a substitute.** The existing throttles protect money and servers; the caps above
  protect the writer.

### 2. The assistance ladder

Every AI feature must say which rung it is on, and the default ceiling is rung 4.

| Rung | The AI…                                                  | Examples                                       | Status                            |
| ---- | -------------------------------------------------------- | ---------------------------------------------- | --------------------------------- |
| 1    | **Asks** questions                                       | Brainstorm questions                           | Default                           |
| 2    | **Reflects**: records or summarises what the writer said | Brainstorm adds a note in the writer's words   | Default                           |
| 3    | **Critiques**: says what is weak, and where              | Critique that points at problems               | Default, rationed (see 1)         |
| 4    | **Offers alternatives** to text the writer wrote         | Several titles/openings drawn from the draft   | Allowed, with the safeguards in 4 |
| 5    | **Originates** text the writer would publish             | A written opening from nothing; a full rewrite | Out of scope                      |

Chores that are not writing (fetching a link's title, finding a feed, formatting) are not on the ladder and are
fine to automate. Framing, angle, evidence and voice are protected. If a person's need is real but sits on rung 5
(language help for a non-native writer, an access need), that is a design conversation to have openly, not a
setting to slip in.

### 3. Writer first; elicit, then record

Prefer designs where the writer produces something before the AI responds, and the AI records or responds to it
rather than supplying it. Brainstorm already does this for notes: the writer says the point, the assistant records it
in their words. A title, angle or audience suggested by the AI before the writer has stated their own pre-empts the
thinking, so the assistant presses for the writer's version first.

### 4. Alternatives, never a single answer (T10)

Titles, openings, closings and social posts stay in scope, with these rules:

- **A set, never one.** Offer several different options (3–5), so the writer is choosing and judging rather than
  accepting. Different in kind, not near-duplicates.
- **Drawn from the writer's text.** Generated from the draft and notes, not from nothing. A request with no draft
  to work from is declined.
- **Pick, then edit.** Choosing an option puts it in an editable field; nothing is used until the writer has had it
  in front of them to change. Show a "write your own" slot alongside the options, first in the list, at no extra
  cost.
- **No one-click path out.** No "copy" or "post" shortcut straight from a generated option, and no publishing
  integration for generated text (social posts especially: that is where AI text most directly reaches readers).
- **Capped regeneration.** "Give me different options" has a small limit (see 1).
- **Origin kept.** The chosen text records that it began as an AI option, and whether the writer edited it.

### 5. Provenance is visible and persists

Every piece of content the AI contributed to has an **origin** (`entered`, `brainstorm`, `reading`, and so on), and
the origin follows the text:

- When a note is inserted into a draft (#33), the inserted passage keeps the note's origin; it does not become
  anonymous prose.
- Decide, and record, what happens when the writer edits AI-origin text. The default: it keeps its origin plus an
  "edited" mark, so the record stays honest. It is not silently relabelled as the writer's own.
- AI-supplied claims (why a source is relevant, what an audience wants) are labelled as the AI's and unverified, and
  are never stored as if they were the writer's own statements.
- Show the writer a mirror of their own use ("9 of 12 notes are yours"), not engagement analytics.

### 6. Acceptance takes thought

A bare Accept button invites automation bias: judging is effortful and clicking is not. Where the AI proposes a
change, prefer **accept and edit** (the proposal lands in an editable field), or ask the writer to restate the point.
Some things (a tool that records a note the writer just said) are fine to apply at once because the writer's own
words are the source; those are on rung 2, bounded in code (add only, capped per reply, no repeats), and carry an
origin. Anything that originates a framing the writer did not state (a title, a new idea) remains a proposal.

### 7. Stance is the user's; boundaries are the app's

People may tune the editor's _stance_ (their own brainstorming prompt: gentler, blunter, different focus). They may
not remove the _boundaries_: the app-owned rules (`prompts/brainstorm-rules.md`) always follow, and the AI has no
tool that can write a draft. Keep it that way for every new prompt.

### 8. Honest about what it is

The AI is a **role, not a person**. It must not claim experiences, feelings, a relationship, or to have read or
visited things it cannot see. The interface already names the model; keep doing that. It must not flatter: praise is
specific or left out, and it holds its position (with reasons) when a writer pushes back on a fair criticism.

### 9. Care when someone is struggling; extra care for writing-to-think

Reflective writing (weeknotes, journalling in public: issue #25) is where reliance and disclosure risks are highest.
For these the assistant reflects and asks; it does not interpret feelings, give life advice, or act as a confidant.
If a writer discloses distress or risk, the assistant drops the editorial persona for a short, warm, non-clinical
reply that points to appropriate support, and does not probe. Because profile threads are visible to members, the
reply also does not invite further disclosure there. The prompt for this mode is set at profile level, not user level
(see #25).

### 10. Minimum data, and honest limits

- Send the least text the feature needs. The brainstorm snapshot has no draft bodies; keep that true, and have a
  test that fails if it stops being true. A feature that does send draft text (critique, options) says so where it
  is used.
- Say what is structural and what is only a prompt. Structural: the AI has no tool to write a draft; draft bodies are
  not in the brainstorm snapshot; proposals need a decision. Prompt-level (and eval-tested, not guaranteed): not
  drafting in chat, not flattering, not inventing facts. Documentation must not describe a prompt-level behaviour as a
  guarantee.
- Third-party text (pages, feeds, the writer's own notes) is data, never instructions.

### 11. Behaviour is part of the contract

Passing the port's contract suite shows an adapter is shaped correctly. It says nothing about whether the model
declines to draft or resists flattery, and those behaviours differ between models. So a new LLM adapter, or a change
to a prompt, must also be run against the **behaviour evals** (see below), and the results looked at. Those are a
rough spot-check, not proof: a model passing a case once does not show it behaves that way reliably. The things
that are guaranteed are the structural ones (principle 10).

## Privacy: shared threads and the writer's provider

**Threads are shared with every member of a profile.** That is a deliberate choice: someone who wants a private space
makes a profile with no other members. The product must say so where it matters:

- **Before the first brainstorm** in a profile with other members, and on the brainstorm page whenever there are:
  "Everyone in this profile can read this conversation, and what you write here is sent to the AI provider of
  whoever is sending the message. If you want to think privately, use a profile with no other members."
- When a member sends a message, **earlier messages and notes by other members go to that member's provider** (the
  whole thread is replayed). Say so in the same notice.
- The brainstorm page and the account page say what is sent: the idea (title, notes, links, venue description) and
  the thread; not draft text.

### Advice for people using their own key

The writer's text goes to their own AI provider, so their provider settings matter. The app should say this where
people add their key (the landing page and _Account → AI assistant_). Draft text, to be adapted for the app, with
Anthropic specifics checked against the provider's current pages before it ships:

> **Protect what you write.** Your writing is sent to Anthropic using your key. A few things to check:
>
> - **Use an API key from the Anthropic Console, not a Claude chat subscription.** API use is under Anthropic's
>   commercial terms, which at the time of writing say Anthropic does not train its models on customer content; the
>   consumer Claude apps have a separate training setting that you control under your account's privacy settings.
>   Check [Anthropic's Privacy Center](https://privacy.claude.com) for the current wording.
> - **Know how long it is kept.** Anthropic's published policy is that API inputs and outputs are deleted within a
>   set period (it has been described as 7 to 30 days, so check the
>   [data retention page](https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention)). Shorter,
>   "zero data retention" arrangements exist but need an agreement with Anthropic and are mainly for organisations.
> - **Make a key just for this app**, in its own Console workspace if you can, with a spending limit set, so you can
>   revoke it without disturbing anything else.
> - **Revoke the key** in the Console if you stop using the service, or lose a device.
> - **Don't put anything in that you couldn't send a trusted contractor**: other people's private details, or
>   material you are under a duty to keep confidential.
>
> If you use a different provider, look for the same three things: whether API data is used for training, how long it
> is kept, and whether you can set a spending limit.

(The sources I found disagreed on the default retention period when this was written. Before shipping this text,
read the two pages above and quote what they say today.)

## Applying this to the roadmap

| Item                                 | Rung | What to do                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brainstorm (shipped)                 | 1–2  | Stop pressing on: fewer questions, a way to end (principle 1). Add distress and persona rules (8, 9).                                                                                                                                                                            |
| T9 Critique (#14)                    | 3    | Ranked, paragraph-anchored points with a ready verdict (#90), kept and marked in the draft (#91), capped per draft with a writer-set limit of 1 to 5, 3 by default (#92: done); rank and stop; say when it is done; point at problems with reasons, not replacement text (1, 2). |
| #26 Suggestions/comments on drafts   | 3    | A comment mechanism is fine. A tracked "suggested change" with replacement text is rung 4–5: not for the AI.                                                                                                                                                                     |
| T10 Titles, openings, etc. (#15)     | 4    | As principle 4: a set, drawn from the draft, pick-then-edit, no shortcut out, capped, origin kept.                                                                                                                                                                               |
| T6 Idea generation (#11)             | 3–4  | Surface items and ask the writer what they notice; do not write pitches. Reshape as T38 was: AI adds to a reading list, the writer makes the idea (2, 3).                                                                                                                        |
| T7/T38 Research (#12, #38)           | —    | AI adds to the reading list only; its "why relevant" is labelled unverified (5, 10). Friction for unread sources (T34) stays.                                                                                                                                                    |
| T16 Audiences (#2), #27 Profile gen. | 2–4  | An AI-drafted description needs an origin, visible evidence (the links used), and the writer's explicit confirmation before it becomes context (5, 6). Built (#131–#136): marked as AI-drafted (and "edited"), unused until accepted.                                            |
| T33 Notes drawer (#33)               | —    | Inserted passages keep the note's origin (5).                                                                                                                                                                                                                                    |
| #25 Writing to think                 | 1–2  | No profile mode (#137): the writer's venue description steers brainstorm and critique; reflect and ask only; principle 9.                                                                                                                                                        |

## How this is checked

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
  - an injection in notes, a page title, a sample post or the writer's description of their venue is not followed;
  - the venue description is used but never as a standard to hold the writer's voice to: a venue described as
    personal thinking gets no demand for an audience or wider appeal (brainstorm and critique), and one with
    described readers is not given invented facts about them (#133);
  - does not make up or reconstruct a source's web address, declines to do research and points to the Research tool, and the researcher reports only pages a search found, with a range of views (#38);
  - proposed notes reuse the writer's own phrases (#6).
- **New LLM adapters** (T14 and any other provider) pass the contract suite, and are also run through the behaviour
  evals: `pnpm eval:adapter -- --provider <id> --model <model>` (it asks for the key, hidden, and how many trials; a few
  trials say more than one), with the summary pasted into the issue for the owner to judge. It is a checklist step and
  a script, not a CI gate: the evals cost money, need a key, and rubric grading can flake.
- **Structural boundaries are tests in `pnpm check`** (`apps/api/src/brainstorm-boundaries.test.ts`, and the
  draft-text test in `brainstorm.test.ts`): the AI has exactly four tools; none can name a draft, an id, a profile or
  a body; planted fields are dropped; a draft has nowhere to carry its text into the snapshot; the app's rules come
  after the person's prompt. Adding a tool or a field to one fails them on purpose: it is a decision about what the AI
  may change.
- **Two groups of cases.** `current` is behaviour the prompts already ask for: a failure is a reason to look (rerun
  with more trials), not proof of a regression.
  `targets` defines work planned in #45, #46 and #49 and may fail until it lands; the issue that does the work moves
  its cases to `current`.
- **Changes to anything in `prompts/`** are changes to the product's behaviour; the owner reviews them.

## Open work

These come out of this page; each is an `inbox` issue to triage.

- Brainstorm: fewer questions, a way to wrap up, and no "keep asking" default.
- Critique: a per-draft cap, ranked output, and a "ready" verdict.
- Privacy notices (shared threads; provider advice above) in the app.
- Distress, persona-honesty and no-flattery rules in the AI's instructions, with evals.
- Behaviour evals as part of accepting an adapter, plus invariant tests for the structural boundaries.
- Provenance in drafts (#33). Venue descriptions are written by the writer; AI drafting of them was removed (#150).
