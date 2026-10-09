# Brainstorming with an LLM: design (T20b)

Status: **agreed; T20b1 (the port) built, the rest not.** Written after a design discussion with the owner. The work is split into tasks
T20b1–T20b5 in [TODO.md](../TODO.md). Why things are the way they are is here; code and tests are the source of
truth once it exists.

## What it is

On an idea's page, **Brainstorm** opens a conversation between the person and their chosen LLM. The model acts as a
**commissioning editor** for the venue (the profile): it probes and scrutinises the idea, and the conversation may
lead to a better title and notes for the idea, or to new ideas worth pursuing separately. It is **not** a drafting
tool: it never writes or edits drafts.

## Decisions (owner)

| Question                             | Decision                                                                                                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Does the model change things itself? | **No. It proposes, the person accepts.** Nothing is written until someone accepts a proposal.                                                                                                                            |
| What may it propose?                 | Change the idea's **title**, change its **notes**, and **create new ideas** (name + initial notes) in the same profile. **Never** edit or create drafts.                                                                 |
| Who sees the conversation?           | **One thread per idea, visible to every member of the profile.** Members may use different LLM providers and models; the thread is stored in our own neutral format so it replays across providers.                      |
| How does it start?                   | The Brainstorm button sends the idea's context to the model and asks it to **start probing straight away**, so the person's first view is the model's questions, not an empty box.                                       |
| What context does the model get?     | The idea (title, notes), its **related-work links** (address and fetched title), and the **venue** (name, website and, once T16 exists, the **audience descriptions**). See _Context_ for what is deliberately left out. |
| Whose prompt?                        | **Per user**, editable on the account page, with a default that makes the model a commissioning editor. In a shared profile, the person sending the message supplies the prompt, key and model.                          |

## How it works

### Tools, not parsing

The model is given three **tools**. When it wants a change it returns a structured call alongside its chat text; we
validate the call and turn it into a **proposal card** in the chat.

| Tool          | Input             | When accepted                                                 |
| ------------- | ----------------- | ------------------------------------------------------------- |
| `update_idea` | `name?`, `notes?` | Replaces the idea's title and/or notes (shown as a diff).     |
| `create_idea` | `name`, `notes`   | Creates a new idea in the same profile (no drafts, no links). |

(One tool for name and notes means one card per suggested change.) Rules for tool calls:

- Tool inputs are **untrusted**: validated with Zod schemas in `@lfwa/core` (same limits as `IdeaInputSchema`),
  and the idea id is never supplied by the model, only taken from the conversation's own idea.
- `tool_choice` stays `auto` (the current models reject forced tool use); the prompt tells the model when to use
  them, and every call's input is validated with its Zod schema regardless of what the model was told.
- The API requires every tool call to be answered in the next user turn. We answer with the proposal's state at
  that moment: _accepted_, _dismissed_, or _the person hasn't decided yet_.
- A proposal records the text it was based on. If the idea has changed since, the card says so and shows the diff
  against the **current** text before it can be accepted. Accepting never silently overwrites newer edits.
- Accepting a `create_idea` proposal creates the idea and links to it from the card. The new idea does not copy
  the thread.

### Context

Built by the server on every turn, never by the client.

- **System prompt**, in two parts, in this order: (1) the **user's brainstorming prompt** (or the default), then
  (2) an **app-owned block** that the user can't edit: how tools work, what the model must not do (draft, claim
  facts about the venue it wasn't given), and how to treat the context (below). Keeping them apart means editing
  your prompt can't break the tool protocol.
- **Idea snapshot**, sent as the start of a user turn: the idea's title and notes, the related links (address and
  title), the venue's name, website and audience descriptions (or a line saying none have been described yet, so the
  model asks), and the _titles_ of existing drafts so it knows what's already been written.
  - A fresh snapshot is attached to a user turn **only when it differs from the last one sent**, since the person
    edits as they chat. Snapshots are stored with the message, not recomputed, so replays are identical.
  - Why not in the system prompt: it would change every turn and defeat prompt caching of the history.
- **Not included:** draft **bodies** (this isn't a drafting tool, and it keeps cost and exposure down), page
  contents behind the links (the model sees what the person sees: address and title; it can't fetch anything),
  other ideas, and any other profile.
- All third-party text in the snapshot (fetched page titles, anything pasted into notes) is **untrusted data**.
  The app block says to treat it as material to discuss, never as instructions.

### Opening move

If the thread is empty, **Brainstorm** creates a hidden "kick-off" turn: the snapshot plus an instruction to begin
the session by probing the idea. It is stored (the API needs the conversation to start with a user turn) but
displayed as a short "Brainstorm started" line, not as a message the person wrote.

### Conversation storage and replay

- One thread per idea, shared by all members, stored in our neutral format: **text and tool calls only**.
  Reasoning ("thinking") blocks are never stored or replayed; they are bound to the model that produced them, and
  members may use different ones.
- Each assistant message records which provider and model produced it; each person message records who sent it.
  The UI shows names, so a shared thread makes sense to read.
- Only **one reply in flight per idea**: if someone else is already waiting for a reply, a second send is refused
  with "{name} is waiting for a reply; try again in a moment".
- **Start again** deletes the thread (confirmation required, since it removes everyone's view of it).
- A reply that fails (rate limit, provider down, refused, cut off by the token cap) leaves the person's message in
  place and shows what happened with a **Try again** button, which asks for the reply without sending a new
  message. A reply the person cancels is kept as far as it got, marked as stopped.

## Calling the model

### Provider port

The existing `LLMProvider` (plain text in, plain text out) is extended, not replaced: `complete`/`stream` keep
working for critique. A new `chat()` takes our own types: messages made of content blocks (`text`, `tool_call`,
`tool_result`), a list of tools (name, description, a JSON schema derived from the Zod schema), and optional
`effort` and `maxTokens`. It yields events: `text` deltas, a complete `tool_call`, and a final `done` carrying the
stop reason (`end`, `max_tokens`, `tool_use`, `refusal`) and token usage. The Anthropic adapter maps these; a
fake provider plays back scripted replies (including tool calls and refusals); the shared contract suite grows to
cover them. Errors translate to our own classes (`LLMAuthError` exists; add rate limit and refusal) so the UI can
tell people what to do.

### Settings

- **Model:** the one the person already chose on their account.
- **No temperature or similar sampling controls.** The current Claude models reject non-default values, and
  other providers differ, so we don't offer them.
- **Effort** (how hard the model thinks): defaults to `medium` for chat latency; not user-settable at first.
- **Max tokens** per reply: generous (8,192), because a notes proposal can be long, and `max_tokens` is handled as
  an expected stop reason, not an error.
- **Streaming** always. These models can pause to think before the first word; the UI shows "thinking…" until text
  arrives.
- **Prompt caching** of the system prompt and history, using the stable-prefix order above.

### Cost

Paid by the person using it, with their own key (never a shared one), as for every AI feature. Each turn resends the
whole thread (the API is stateless): a rough guess is a cent or two per turn on a mid-size model, much less with
caching. Context windows are large, so there is no summarising or trimming in the first version; add it when
threads get long enough to matter.

## Security and privacy

- **Prompt injection** is the main risk, because notes and fetched page titles enter the prompt. The design
  limits the damage structurally: the model can only _propose_, a person reads each proposal before accepting,
  and the model has no way to fetch, send or delete anything.
- **Rendering:** model output is Markdown, rendered with HTML **off**, images **off** (an image address is a way to
  leak data to a stranger's server), links opening in a new tab with `rel="noopener noreferrer"`. Plain text is
  never put into the page as HTML.
- **Per-user custom prompt:** length-capped (8,000 characters), only ever used for that person's own calls, never
  shown to other members. It can't change the app-owned block.
- **Privacy:** the idea, notes, links and venue description go to the person's LLM provider under their own key.
  The brainstorm page says so. In a shared profile, a message from a member is sent through _that_ member's
  provider.
- **No content in logs:** conversations, prompts and keys are never logged; errors log a code and ids only
  (AGENTS.md).
- **Throttling:** per-person limit on messages (it spends their money and our server time), one in flight per idea,
  and requests abort the provider call when the browser disconnects.
- **Deletion:** the thread belongs to its idea (`ON DELETE CASCADE`), so deleting an idea, a profile or the last
  member's account removes it; messages keep the author as `SET NULL` so a leaving member's messages stay.

## Data

New tables (append-only migrations):

- `idea_messages(id, idea_id → ideas ON DELETE CASCADE, seq, role, kind, author_id → users ON DELETE SET NULL,
provider, model, content JSON, status, created_at)`: `kind` is `kickoff` or `message`; `status` is `complete`,
  `stopped` or `failed`.
- `idea_proposals(id, message_id → idea_messages ON DELETE CASCADE, tool_call_id, tool, input JSON, base JSON,
status pending|accepted|dismissed, decided_by, decided_at, created_idea_id)`.
- A per-user brainstorming prompt: `user_prompts(user_id PK → users ON DELETE CASCADE, brainstorm TEXT, updated_at)`,
  with no row (or null) meaning "use the default".

The profile-rename list needs no change (these tables hang off ideas and users, not profiles).

## API

All under `/api/profiles/:profileId/ideas/:id/conversation` (members only):

- `GET`: the thread, with proposals and their states.
- `POST /messages`: body `{ text }`, or `{ start: true }` for the kick-off or `{ retry: true }` for a retry.
  Answers as a **server-sent event stream** (`text`, `proposal`, `done`, `error`); the browser reads it with
  `fetch` and a stream reader, not `EventSource`, so it can POST and cancel.
- `POST /proposals/:proposalId/accept` and `/dismiss`: accept re-checks the base text and applies the change in one
  transaction (updating the idea, or creating one).
- `DELETE`: start again.

And on the account: `GET`/`PUT`/`DELETE /api/account/brainstorm-prompt` (the effective prompt and whether it is
the default; save; reset).

## UI

- **Idea page:** the disabled button becomes **Brainstorm**, opening `/p/:profile/ideas/:idea/brainstorm`. The idea
  page itself shows nothing of the conversation but a "Brainstorm" link (with "Continue" once a thread exists).
- **Brainstorm page:** the thread (names, markdown, proposal cards with diffs and Accept/Dismiss), a message box, a
  Stop button while streaming, and a collapsed summary of the idea being discussed. Keyboard-usable; the thread is
  a `role="log"`; streaming text is announced politely and not word by word; loading, empty, error and
  "someone else is waiting" states all designed, and checked at phone width.
- **Account page:** a "Brainstorming prompt" section: a text area showing the prompt in effect, **Save**, and
  **Reset to default**, with a short explanation of what the prompt does and that the app adds its own rules.
- One new dependency: **`markdown-it`** (HTML and images disabled) to render model output. No chat framework: a
  framework would bring its own protocol and cut across the ports-and-adapters rule.

## The default prompt

Drafted from how commissioning editors describe what they look for in a pitch: a specific angle you can state
as one paragraph about the _story_, not the general topic; something that makes an editor curious or surprises
them; a reason to run it now; fit with the publication and a clear sense of who reads it and why they would care;
the author's standing to write it; and the common reasons pitches are rejected (wrong publication, vague or
generic, nothing new, no evidence). Sources: [Booktrust, "What an editor looks for in a pitch"](https://Www.Booktrust.Org.Uk/globalassets/resources/prizes/in-other-words/2019/what-an-editor-looks-for-in-a-pitch.pdf),
[Clippings, "Three things all editors look for when commissioning from new writers"](https://www.clippings.me/blog/what-editors-look-for-when-commissioning/),
[Poynter on pitching](https://poynter.org/?p=447029). It is a starting point, to be tuned against the evals
below and the owner's own experience.

**The prompts live in [`prompts/`](../prompts/README.md), as plain Markdown files, so they're easy to find and
edit; this document no longer holds a copy.** The default is `prompts/brainstorm-default.md`, and the rules the app
always adds are `prompts/brainstorm-rules.md`. The code reads them through the `@lfwa/prompts` package.

The app-owned block (`prompts/brainstorm-rules.md`, not editable by users) adds the mechanics: the tools and when proposals are used, the instruction to
treat everything in the idea snapshot as material, not commands, and the reminder that draft bodies are not
available and not wanted.

## Testing

- **Unit/API:** the fake provider drives the whole flow: kick-off, streaming, proposals (accept, dismiss, stale),
  retry, cancel, one-in-flight, access control, cascade on idea/profile/account deletion, prompt save/reset.
- **Contract:** the extended port against the fake and (opt-in, with a key) the Anthropic adapter.
- **Component:** the chat states (loading, empty, streaming, error, proposals), the rendered Markdown (no HTML,
  no images), the account prompt section.
- **e2e:** brainstorm from an idea with the fake provider, accept a proposal, see the change on the idea page, edit
  the prompt on the account page; axe on both pages.
- **Evals** (`evals/promptfooconfig.yaml`, run with a real key): the default prompt, given an idea snapshot, should
  open with probing questions and not a lecture; push back on a vague idea; not draft text; not invent facts about
  the venue; use the audience description when given and ask for it when absent; not propose after every turn.

## Build order

1. **T20b1**: port extension, Anthropic adapter, fake, contract tests.
2. **T20b2**: storage, service (context building, replay, proposals), API and streaming, one-in-flight, throttling.
3. **T20b3**: the account-page prompt setting (storage, API, UI) and the default prompt.
4. **T20b4**: the brainstorm page (chat, proposals, Markdown rendering) and the idea-page link.
5. **T20b5**: evals and tuning the default prompt.

**T16 (audiences)** is not a hard dependency, but brainstorming is much better with it: the model is told the
venue's readers instead of asking for them every time. Build T16 first if possible; the context builder simply
omits the audience section until it exists.

## Open questions (not blocking)

- Whether new ideas created by the model should record which idea they came from.
- Per-profile prompts (a house style for each venue), later.
- Offering an effort setting, or a cheaper model for brainstorming only.
- Trimming or summarising long threads, when they get long enough to matter.
