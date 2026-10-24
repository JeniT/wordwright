# A person's brainstorming prompt: removed (#205)

People could once edit their own brainstorming prompt (stored in `user_prompts`, only when it differed from the default, so
improving the default reached everyone who hadn't really changed it). That is gone: everyone uses
`prompts/brainstorm-default.md`, then the app's fixed rules (`prompts/brainstorm-rules.md`). It was the longest and least
used section of the account page, and a personal prompt could pull the AI away from the rung the product claims
(see responsible-ai.md, "Stance is the user's; boundaries are the app's"). A migration drops `user_prompts`, so saved
versions are deleted rather than kept where nobody can see or use them. Anyone who had customised theirs now gets the
default.
