# Brainstorming proposes; it never edits, and it never drafts

The brainstorm conversation (design in [brainstorming.md](../../brainstorming.md)) lets the person's LLM suggest a new
title, notes for an idea, pages to read, or a new idea, as **proposals the person accepts**; nothing is written
otherwise. That is both the owner's rule that the author's voice and decisions stay theirs and the main defence against
prompt injection (idea notes and fetched page titles go into the prompt): the model has no way to change, fetch or send
anything. It deliberately cannot touch drafts, and draft bodies are not sent to it. An idea holds up to five
conversations ([An idea holds several Refine conversations](an-idea-holds-several-refine-conversations.md)), each shared
by all members of the publication; each message is sent with its sender's own key and model, so the thread is stored in
our own neutral format (text and tool calls, no provider "thinking" blocks) to replay across providers. The persona is
the app's default coach ([The brainstorm is a writing coach](the-brainstorm-is-a-writing-coach-and-the-app.md)); people
cannot edit it ([removed in #205](a-persons-brainstorming-prompt-removed.md)).
