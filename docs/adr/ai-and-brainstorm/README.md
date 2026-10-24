# Decisions: ai and brainstorm

Read this when you change the AI: prompts, the Refine conversation, keys and models, behaviour evals. One file per decision; the title says what was decided. Open the ones that touch your change.

- [A person's brainstorming prompt: removed (#205)](a-persons-brainstorming-prompt-removed.md): everyone gets the default prompt; a personal one could pull the AI off its rung
- [A reply is always in words, whatever tools it calls (#303, #304, #305, and the first eval run, #6)](a-reply-is-always-in-words-whatever-tools-it.md): the app continues a tool-only reply; what the real-model runs taught the prompts
- [An eval for the notes the coach suggests (#184)](an-eval-for-the-notes-the-coach-records.md): how the note-suggestion eval measures "the writer's own words"
- [An idea holds several Refine conversations (#289)](an-idea-holds-several-refine-conversations.md): up to five conversations per idea, separate by construction
- [Behaviour evals: a smoke test that sends what the app sends](behaviour-evals-a-smoke-test-that-sends-what-the.md): evals are a smoke test that sends exactly what the app sends
- [Brainstorm: knowing when to stop (#46)](brainstorm-knowing-when-to-stop.md): the coach says when the idea is ready; no cap on questions
- [Brainstorming proposes; it never edits, and it never drafts](brainstorming-proposes-it-never-edits-and-it-never-drafts.md): the model only proposes, never touches drafts; the main defence against injection
- [Conversations have titles: named by the AI, renamed by a person (#294)](conversations-have-titles-named-by-the-ai-renamed-by.md): the AI names a conversation once; people can rename it
- [How the brainstorm conversation is stored, replayed and kept safe](how-the-brainstorm-conversation-is-stored-replayed-and-kept.md): neutral storage so threads replay across providers; one reply at a time
- [Notes are suggested, not added (#295; supersedes T30)](notes-are-suggested-not-added.md): the AI suggests notes in a list above its reply; a person adds them
- [Persona, flattery and distress rules are the app's, not the writer's (#49)](persona-flattery-and-distress-rules-are-the-apps-not.md): honesty, no-flattery and distress rules live in the app-owned rules
- [Prompts are Markdown files in a top-level folder; `chat()` extends the LLM port](prompts-are-markdown-files-in-a-top-level-folder-chat.md): prompts are Markdown in prompts/; the LLM port gains chat() with tools
- [The AI is told which notes are quotations (#293)](the-ai-is-told-which-notes-are-quotations.md): quoted notes are marked so the AI never takes them as the writer's view
- [The brainstorm is a writing coach, and the app owns when it stops (T43)](the-brainstorm-is-a-writing-coach-and-the-app.md): a coach, not a sceptical editor; the app, not the prompt, owns when to stop
- [The brainstorm page: reading the stream by hand, rendering safely, consenting by clicking](the-brainstorm-page-reading-the-stream-by-hand-rendering.md): fetch not EventSource; untrusted Markdown; visiting never spends
- [The model is chosen from what the provider offers the key (#206)](the-model-is-chosen-from-what-the-provider-offers.md): ask the provider which models the key can use, not a curated list
- [The saved AI key shows elided in its field](the-saved-ai-key-shows-elided-in-its-field.md): the saved key shows as a safe elided placeholder
