# How the brainstorm conversation is stored, replayed and kept safe

One thread per idea in `idea_messages`, in our own neutral format (text and tool calls only; the model's reasoning is
never kept), plus `idea_proposals` for its suggestions. What people see (`display_text`) is stored apart from what is
replayed (`content`): a person's message is stored with the answers to the AI's last suggestions and, only when the
idea differs from what the AI last saw, a fresh snapshot of it. Snapshots are stored with the message, not recomputed,
so the replayed history never changes and the provider's prompt cache keeps working. The AI's own tool input is
validated with the shared Zod schemas; invalid, unknown or surplus (more than five) calls are kept in the history so
the model sees them answered, but never become proposals, and a suggestion that repeats the idea back is dropped.
Accepting is one transaction that also records the decision with `WHERE status = 'pending'`, so two people can't both
decide it; a suggestion made against older text must be accepted with `overwrite`, comparing only the fields it would
replace. One reply at a time per idea is an in-memory slot (fine for one API process, like the rate limiters; it
needs a shared store if the API ever runs as several), which frees itself after the reply timeout. The reply is
streamed as server-sent events; a reply that fails stores nothing but the person's message, so **Try again** needs no
resend, and **Stop** keeps what was said, marked stopped, without any half-made suggestion. The tool-call text the AI
sees in return ("The writer accepted this suggestion...") is deliberately plain statements about what happened.
Only the `Reader` snapshot section waits on T16 (audiences); until then the AI is told readers aren't described and
asks.
