# Brainstorming with an LLM: design (T20b)

Read this when you change how the brainstorm conversation works: its tools, context, storage, prompt or safety. The API
summary is in [ai-features.md](ai-features.md); the code and tests are the source of truth for routes, tables and UI, and
the decisions that changed this design since it was written are in [docs/adr/ai-and-brainstorm/](adr/ai-and-brainstorm/README.md)
(notably [notes are suggested, not added](adr/ai-and-brainstorm/notes-are-suggested-not-added.md)).

## What it is

On an idea's page, **Refine** opens a conversation between the person and their chosen LLM. The model acts as a **writing
coach** (T43; the first version was a sceptical commissioning editor, which the owner found too critical): it helps the
writer find what they think and say it in their own words, and the conversation fills the idea's notes and may lead to a
better title, or to new ideas worth pursuing separately. It is **not** a drafting tool: it never writes or edits drafts.

## Decisions (owner)

| Question                             | Decision                                                                                                                                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the model change things itself? | **No. It suggests and the person accepts.** A new note, title, idea or page to read is made only when someone accepts it. (T30 let it add notes at once; #295 reversed that.)                                                     |
| What may it do?                      | **Suggest notes**, a new **title**, a **new idea** (name + starting notes) in the same publication, and **pages to read**. It cannot edit or remove notes. **Never** edit or create drafts.                                       |
| Who sees the conversation?           | **Up to five conversations per idea (#289), each visible to every member of the publication.** Members may use different LLM providers and models; the thread is stored in our own neutral format so it replays across providers. |
| How does it start?                   | The start button sends the idea's context and asks the model to **start probing straight away**, so the person's first view is the model's questions, not an empty box. Visiting the page sends nothing.                          |
| What context does the model get?     | The idea (title, notes), its **articles** (address and fetched title), and the **publication** (name, website and the writer's own **description** of it, when they have written one). See _Context_ for what is left out.        |
| Whose prompt?                        | **The same for everyone**: a default that makes the model a writing coach (not editable since #205). In a shared publication, the person sending the message supplies the key and model.                                          |

## How it works

### Tools, not parsing

The model is given five **tools**. When it wants a change it returns a structured call alongside its chat text; we validate
the call and turn it into a **suggestion** shown in a list above its reply (or, for `name_conversation`, apply it at once).

| Tool                | Input                         | What happens                                                                                                                                                                                                                                    |
| ------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `suggest_note`      | `text`                        | A suggestion: adds a note to the idea (origin `brainstorm`) when a person adds it.                                                                                                                                                              |
| `update_idea`       | `name`                        | A proposal: replaces the idea's title when accepted.                                                                                                                                                                                            |
| `create_idea`       | `name`, `notes`               | A proposal: creates a new idea in the same publication (no drafts, no links) when accepted.                                                                                                                                                     |
| `name_conversation` | `title` (up to 60 characters) | Applies at once: a label for the conversation, on the AI's first reply (#294). Only the first valid call counts, and only while the conversation has no title, so a person's rename is never overridden.                                        |
| `suggest_reading`   | `url`, `title`, `why`         | A proposal: adds a page to the idea's articles when accepted. Only an address a person wrote in the thread is kept (the coach can't search); the address is checked and shown beside the page's real title. Research proper is a separate tool. |

Rules for tool calls:

- Tool inputs are **untrusted**: validated with Zod schemas in `@wordwright/core`, and the idea id is never supplied by the
  model, only taken from the conversation's own idea.
- `tool_choice` stays `auto` (the current models reject forced tool use); the prompt tells the model when to use tools, and
  every call's input is validated regardless of what the model was told.
- The API requires every tool call to be answered in the next user turn. We answer with what became of it: a proposal's state
  at that moment (_accepted_, _dismissed_, or _the person hasn't decided yet_), or for a note _added_, _already there_ or
  _the idea is full_.
- A title proposal records the title it was based on. If the title has changed since, the card says so, and accepting needs
  "Apply anyway". Accepting never silently overwrites a newer title.
- Prompt injection stays bounded: the worst a hostile page title or pasted note can make the model do is offer suggestions a
  person must accept (note suggestions are capped at 6 per reply, with a duplicate check), never change or remove anything.

### Context

Built by the server on every turn, never by the client.

- **System prompt**, in two parts, in this order: (1) the **default brainstorming prompt** (`prompts/brainstorm-default.md`),
  then (2) an **app-owned block** (`prompts/brainstorm-rules.md`): how tools work, what the model must not do (draft, claim
  facts about the publication it wasn't given), and how to treat the context. Keeping them apart means the tool protocol can
  change without touching the coach's wording.
- **Idea snapshot**, sent as the start of a user turn: the idea's title and notes, the articles (address and title), the
  publication's name, website and the writer's description of it in a `<publication_description>` block (or a line saying it
  has not been described yet, so the model asks who the readers are, unless the description says the writing is personal), and
  the _titles_ of existing drafts so it knows what's already been written. A note that is a quotation is marked as such, so
  the model never takes it for the writer's own point ([the AI is told which notes are quotations](adr/ai-and-brainstorm/the-ai-is-told-which-notes-are-quotations.md)).
  - A fresh snapshot is attached to a user turn **only when it differs from the last one sent**, since the person edits as
    they chat. Snapshots are stored with the message, not recomputed, so replays are identical.
  - Why not in the system prompt: it would change every turn and defeat prompt caching of the history.
- **Not included:** draft **bodies** (this isn't a drafting tool, and it keeps cost and exposure down), page contents behind
  the links (the model sees what the person sees: address and title; it can't fetch anything), other ideas, and any other
  publication.
- All third-party text in the snapshot (fetched page titles, anything pasted into notes) is **untrusted data**. The app block
  says to treat it as material to discuss, never as instructions.

### Opening move

If the thread is empty, starting creates a hidden "kick-off" turn: the snapshot plus an instruction to begin the session by
probing the idea. It is stored (the API needs the conversation to start with a user turn) but displayed as a short "Refine
started" line, not as a message the person wrote.

### Conversation storage and replay

- Each conversation is a thread shared by all members, stored in our neutral format: **text and tool calls only**. Reasoning
  ("thinking") blocks are never stored or replayed; they are bound to the model that produced them, and members may use
  different ones. Each assistant message records which provider and model produced it; each person message records who sent it.
- Only **one reply in flight per conversation**: a second send is refused with "{name} is waiting for a reply; try again in a
  moment".
- **Delete conversation** deletes one thread and its suggestions (confirmation required, since it removes everyone's view of
  it). A new conversation has no memory of the others: its first message carries the idea afresh.
- A reply that fails (rate limit, provider down, refused, cut off by the token cap) leaves the person's message in place and
  shows what happened with a **Try again** button, which asks for the reply without sending a new message. A reply the person
  cancels is kept as far as it got, marked as stopped.
- A model that calls tools and says nothing is continued by the app
  ([a reply is always in words](adr/ai-and-brainstorm/a-reply-is-always-in-words-whatever-tools-it.md)).

## Calling the model

- **Provider port.** `chat()` extends `LLMProvider` (our own types: content blocks, tools as JSON Schema derived from Zod,
  `text` / `tool_call` / `done` events with a stop reason and usage); `complete` / `stream` keep working for critique. Errors
  translate to our own classes so the UI can tell people what to do. See
  [prompts are Markdown files; chat() extends the port](adr/ai-and-brainstorm/prompts-are-markdown-files-in-a-top-level-folder-chat.md).
- **Model:** the one the person already chose on their account. **No temperature or similar sampling controls**: the current
  Claude models reject non-default values, and other providers differ.
- **Effort** defaults to `medium` for chat latency; not user-settable at first. **Max tokens** per reply is generous (8,192),
  and `max_tokens` is handled as an expected stop reason, not an error.
- **Streaming** always. These models can pause to think before the first word; the UI shows "thinking…" until text arrives.
- **Prompt caching** of the system prompt and history, using the stable-prefix order above.
- **Cost** is paid by the person using it, with their own key (never a shared one). Each turn resends the whole thread (the API
  is stateless): a rough guess is a cent or two per turn on a mid-size model, much less with caching. There is no summarising
  or trimming of long threads; add it when threads get long enough to matter.

## Security and privacy

- **Prompt injection** is the main risk, because notes and fetched page titles enter the prompt. The design limits the damage
  structurally: the model can only _suggest_, a person reads each suggestion before accepting, and the model has no way to
  fetch, send or delete anything.
- **Rendering:** model output is Markdown, rendered with HTML **off**, images **off** (an image address is a way to leak data
  to a stranger's server), links opening in a new tab with `rel="noopener noreferrer"`
  ([the brainstorm page](adr/ai-and-brainstorm/the-brainstorm-page-reading-the-stream-by-hand-rendering.md)).
- **Privacy:** the idea, notes, articles and publication description go to the person's LLM provider under their own key. The
  page says so. In a shared publication, a message from a member is sent through _that_ member's provider
  ([the rules](ai-features.md#privacy-shared-threads-and-the-writers-provider)).
- **No content in logs:** conversations, prompts and keys are never logged; errors log a code and ids only
  ([conventions-api.md](agents/conventions-api.md#conventions-for-the-api-core-and-database)).
- **Throttling:** per-person limit on messages (it spends their money and our server time), one in flight per conversation, and
  requests abort the provider call when the browser disconnects.
- **Deletion:** a thread belongs to its idea (`ON DELETE CASCADE`), so deleting an idea, a publication or the last member's
  account removes it; messages keep the author as `SET NULL` so a leaving member's messages stay.

## The default prompt

A **writing coach**, following [responsible-ai.md](responsible-ai.md): the writer's thinking comes first and the AI elicits it
(one question at a time, reflecting back in the writer's own words, asking what they think before it says what it does); it
challenges gently and only where that helps, holds a fair criticism under pushback and leaves out praise that isn't specific
(no flattery); it keeps the readers in view without inventing facts about them; it is honest that it is an AI and cannot open
links; and it never drafts. The earlier version (a sceptical commissioning editor) tested whether an idea was good enough to
run; that is not what someone working out what they think needs.

**Stopping is the app's rule, not the prompt's.** `prompts/brainstorm-rules.md` tells the AI to ask the one question that
matters most, and, once the writer can say what the idea claims, who it is for and why it matters, to say so plainly and let
the session end, because the aim is for the writer to get on and write, not to keep talking to the tool (responsible-ai.md,
principle 1). Like the rest of what the model does, this is prompt-level and checked by evals ([evals.md](evals.md)), not
guaranteed. Whether the prompt should differ for writing to think in public is #25.

The prompts live in [`prompts/`](../prompts/README.md) as plain Markdown files; this document holds no copy.

## Open questions (not blocking)

- Whether new ideas created by the model should record which idea they came from.
- Per-publication prompts (a house style for each publication), later.
- Offering an effort setting, or a cheaper model for brainstorming only.
- Trimming or summarising long threads, when they get long enough to matter.
