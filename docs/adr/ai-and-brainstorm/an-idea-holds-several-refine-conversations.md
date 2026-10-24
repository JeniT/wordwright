# An idea holds several Refine conversations (#289)

An idea had one Refine thread, and starting again deleted it. It now holds up to **five** (`MAX_CONVERSATIONS_PER_IDEA`), shown one at a time like the research runs (newest first, "Earlier conversation" / "Later conversation", each labelled with its start date and who began it), and any member can delete one. The limit is deliberate: a conversation can always be started again, so, like critiques and Rephrase rounds, the number is capped, and deleting one makes room. The AI's rung and what it is sent do not change (it asks and records the writer's own points; never draft text).

- **Separate by construction.** Messages, suggestions and the "snapshot last sent" belong to a conversation (`idea_messages.conversation_id`, `ON DELETE CASCADE`), so a new conversation carries the idea afresh and the AI never receives another conversation's messages. One reply at a time is now per conversation. `seq` still counts across the idea, which only keeps the existing uniqueness.
- **Empty ones are reused.** `POST /conversations` returns the empty one already waiting rather than making another, so a failed start (no key yet) does not use up the limit; the start button on an empty conversation fills it.
- **The migration** makes each existing thread its first conversation. Ideas with no thread get none.
- **New content reaches the AI with the next message.** Each message is checked against the last snapshot sent in that conversation, and a new snapshot (title, notes, links, publication description) goes with it when anything changed.
- **Wording** beyond what changed here (the start button, "Coach") is the Refine content crit (#283, rewrite #288).
