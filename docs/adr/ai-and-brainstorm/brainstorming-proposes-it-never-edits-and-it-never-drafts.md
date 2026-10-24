# Brainstorming proposes; it never edits, and it never drafts

The brainstorm conversation (design in [brainstorming.md](../../brainstorming.md)) lets the person's LLM suggest a new
title or notes for an idea, or a new idea, as **proposals the person accepts**; nothing is written otherwise. That
is both the owner's rule that the author's voice and decisions stay theirs and the main defence against prompt
injection (idea notes and fetched page titles go into the prompt): the model has no way to change, fetch or send
anything. It deliberately cannot touch drafts, and draft bodies are not sent to it. One thread per idea is shared
by all members of the publication; each message is sent with its sender's own key, model and prompt, so the thread is
stored in our own neutral format (text and tool calls, no provider "thinking" blocks) to replay across providers.
The default prompt makes the model a sceptical commissioning editor and lives in code; each user can edit their
own copy on the account page.
