# AI features: brainstorming, research, critique, Rephrase

Read this when you change a feature that calls the AI: its API, its limits, its prompt or its fake. Keys are in [byok.md](byok.md); the rules these features answer to are in [responsible-ai.md](responsible-ai.md).

**Brainstorming prompt:** the instructions that make the AI a writing coach when you brainstorm an
idea are the Markdown file `prompts/brainstorm-default.md`; the app adds its own fixed rules after it
(`prompts/brainstorm-rules.md`). The same for everyone: it is not editable (#205).

**Brainstorming API** (design: [docs/brainstorming.md](brainstorming.md)): `/api/publications/:id/ideas/:idea/conversations`
holds up to five conversations per idea (#289), each shared by the publication's members. `GET` lists them (each with its `title`); `POST` starts one; `PATCH` renames one;
under `/:conversation`, `GET` reads it; `POST /messages` (`{text}`, `{start:true}` or
`{retry:true}`) streams the AI's reply as server-sent events; `POST /proposals/:id/accept` and `/dismiss` decide the
AI's suggestions (a new title for the idea, a new idea, or a page for the idea's articles that the writer gave it: it can never touch drafts); the points the writer makes are suggested as notes (`suggest_note`), which a person adds, edits or ignores (#295); `DELETE` deletes that conversation. Each message is sent with its sender's own key, model and prompt. Nothing the AI suggests is applied until a
person adds or accepts it. The page is `/p/<publication>/ideas/<idea>/refine` (the idea's **Refine** step: visiting it spends nothing; **Refine with your AI** begins; **New conversation** starts another, up to five; **Earlier/Later conversation** page between them): the editor's reply
streams in word by word (read with `fetch`, so **Stop** works), its Markdown is rendered safely (HTML and images are
never shown), and each notes recorded is listed under the reply and each suggestion is a card. With
`FAKE_LLM=true` the editor is scripted: it opens with a question, and answers "suggest a title", "note that …" and
"suggest a new idea" with the matching call, and "suggest some reading" with a suggestion of pages to read.

**Research** (the AI adds to the articles; decision in [adr/research-and-feeds/research-is-its-own-tool-and-the-ai-adds.md](adr/research-and-feeds/research-is-its-own-tool-and-the-ai-adds.md)): the Research step (`/p/<publication>/ideas/<idea>/research`), a page apart from brainstorming that takes a new request, a description of the areas to look into, and
shows the idea's research one run at a time (newest first; **Earlier research** and **Later research** step through the rest),
each as a list laid out like the Scan page's. `GET`/`POST /api/publications/:id/ideas/:idea/research` (`{areas}`) list and run
it with the person's own key; each run is saved with the pages it found, and `POST …/research/:run/add`, `/dismiss` and
`/reconsider` (`{itemIds}`) add pages to the articles, ignore them, or take either back (reconsidering an added page removes it from the
articles); `DELETE …/research/:run` forgets a run. The search
looks for several points of view. It works through the `ResearchProvider` port (`@wordwright/core`: `AnthropicResearchProvider`,
`FakeResearchProvider`, and `researchProviderContract` in `@wordwright/core/testing` for any new one), which may only return addresses that
appeared in a search result. Web search must be enabled for the Anthropic account whose key is used. The server looks at each address
with the same SSRF-safe page fetcher as typed links and shows the page's real title, flagging an address that
doesn't resolve (it can't be added). Nothing joins the articles until a person adds it; it keeps the AI's reason,
highlighted as the AI's in the articles (one highlighted line above the list says what the highlight is; no badge says where an item came from). The brainstorm coach can also suggest a page, but only an address the writer
gave it. Searches are throttled to 10 an hour per person, with no other cap. With `FAKE_LLM=true` a search finds three scripted
pages: one fine, one with no readable title and one that doesn't exist; and the coach turns an address plus "articles" into a suggestion.

## Critique and Rephrase

- **Critique** returns a few ranked points, each about a numbered paragraph of the draft, and says when a draft is ready
  (the design is in [adr/review-and-comments/critique-points-are-anchored-to-paragraphs-by-id-outside.md](adr/review-and-comments/critique-points-are-anchored-to-paragraphs-by-id-outside.md)).
  The latest critique is kept with the draft, and its points are comments (above), marked beside the paragraphs they are about. A draft
  gets 3 critiques by default (each person can choose 1 to 5 on Your AI), counted per draft.
- **Rephrase** (`POST /api/publications/:id/assist/rephrase`, the draft's editor only) returns options for a selected passage
  or the title: `{draftId, kind: 'title'|'passage', wording, aim, earlier}` gives `{size, options}`. `earlier` holds the
  rounds already asked in this window, so the AI is told what it has offered and a later round needs a different aim.
  The server keeps nothing (the window holds the state; the record on use comes with #162). It refuses a selection that
  crosses paragraphs or is outside 5 to 150 words, an aim of fewer than 3 words, and a title for a draft under about 300
  words, before spending anything. Critique and Rephrase share one throttle of 30 requests per 10 minutes per person (abuse, not a quota). Short wording (a title, or up to 25 words) gets 5 to 10 options, longer gets 3 to 5, and the
  AI is told to make them differ in approach. Every number is in one place, `packages/core/src/rephrase.ts`. The prompt is
  `prompts/options.md`. The round limit in a window is the critique-looks setting (Your AI page). Only the draft, wording,
  aim and publication description are sent: never notes, threads or comments.
  **The Rephrase window** (#162): in the draft editor, select words inside one paragraph and press **Rephrase**. A dialog
  shows the wording (editable), asks "What should it do?" (the Aim), and **Generate options** (saving the draft first, since
  the AI reads the saved draft) brings a list (short wording) or carousel (longer) with a **Replace wording** button on
  each; **Use this** replaces exactly the selected words, saves the draft and, if the words began as an option, records it
  (`POST …/drafts/:id/option-insertions`, in `draft_insertions` with origin `option`, shown in the draft's "Where some of the
  words came from" list). The record is the writer's own report of what was offered, because the server keeps nothing between
  rounds. Words the writer wrote themselves leave no record. The fake LLM (`FAKE_LLM=true`) answers with numbered options.
  **Rephrase title** (#163): the button beside the title opens the same window with the title as the wording and no selection.
  It waits until the draft has at least `REPHRASE.titleMinBodyWords` (300) words and says so; **Use this** sets the title,
  saves, and records it with kind `title`. Options are short (a list of about 8, each at most 20 words).

## Privacy: shared threads and the writer's provider

**Threads are shared with every member of a publication.** That is a deliberate choice: someone who wants a private space
makes a publication with no other members. The product must say so where it matters:

- **Before the first brainstorm** in a publication with other members, and on the brainstorm page whenever there are:
  "Everyone in this publication can read this conversation, and what you write here is sent to the AI provider of
  whoever is sending the message. If you want to think privately, use a publication with no other members."
- When a member sends a message, **earlier messages and notes by other members go to that member's provider** (the
  whole thread is replayed). Say so in the same notice.
- The brainstorm page and the account page say what is sent: the idea (title, notes, links, publication description) and
  the thread; not draft text.
