# A reply is always in words, whatever tools it calls (#303, #304, #305, and the first eval run, #6)

A real run came back with a conversation title and a note suggestion but no words. The server accepts a reply of tool
calls alone, and the model took its tool calls as the whole turn. Prompt changes did not fix it (the first run after
#303 passed 5 of 25, the second still failed 20 of 25), so the app now handles it: when a reply has calls, no words and
stop reason `tool_use`, `brainstormTurn` (in `services/brainstorm.ts`) sends the calls back as a user turn with each one
answered and a note to write the message in words, and streams what the model then says as the reply. It is one extra
request, only then; further calls in it are ignored, so it never loops; the stored message is the words then the calls,
so replay is as for any reply. If a reply still has no words, its box says "Your AI didn’t write a reply. Send a message
to carry on." and the suggestions are not lost.

The prompts also say the message comes first and tool calls after it (in the kickoff turn as well as the rules and tool
prompts), that notes already in the snapshot are never suggested back, and that a title is a noun phrase naming the
subject, not a question. The evals check it (`repliesInWords`) on every case that uses a tool, and the harness runs the
same `brainstormTurn`, so the evals test what the app does.

What the first real run (#6) taught about prompts: the model had followed them, so they changed. They had asked for
"what you would do next" (it gave three to five bullets), said nothing against advice after the writer was done (it
added "come back if you get stuck"), and allowed "two questions at most" (it asked two or three). Now: one question
(examples of an answer stay inside it), one next step in a sentence, a sentence or two to close with no invitation back.
The "says when the idea is ready" rubric was loosened with the owner's agreement to allow a short paragraph with one or
two pointers and no list; that moved the bar after seeing failures, so rerun it on a real model to confirm it still
catches a long list of next steps.

**Prompt changes (`brainstorm-kickoff.md`, `brainstorm-rules.md`, `tool-suggest-note.md`, `tool-name-conversation.md`):
the owner reviews them and runs the evals against a real model.**
