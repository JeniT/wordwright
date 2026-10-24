# First real eval run: the prompts asked for more than we wanted (#6)

The first run against a real model (3 trials) passed the distress and no-flattery cases (3/3 each) and failed the stop-and-ask cases
from #46: the model agreed the idea was ready and then gave three to five bullets of "what I'd do next", because
`brainstorm-rules.md` said to "say what you would do next"; it added advice and "come back if you get stuck" after the writer said
they were done, because nothing said not to; and it asked two or three questions in an opening, because the default prompt said
"two at most". The model had followed the prompts, so the prompts changed: one question (examples of an answer stay inside it),
one next step said in a sentence, a sentence or two to close with no further advice and no invitation back. The question check
counted `?` characters, which fails "a river, a moment, or something you read?"; it is now a rubric that allows examples inside
one question. Not yet re-run on a real model: the changed cases need `pnpm eval -- --case says-when-the-idea,does-not-reopen,asks-one-question --trials 3`.

**Follow-up, second run.** Of the three changed cases, `does-not-reopen-when-the-writer-stops` and `asks-one-question` passed 3/3. `says-when-the-idea-is-ready`
still failed 0/3 although the replies were short, asked nothing and ended with "Good luck": each added a second small pointer (where to
start, and whether the 40cm is per summer), and the rubric allowed one. The prompt already says to give one thing; the rubric was stricter
than what #46 is for (no new questions, no more brainstorming, no long list), so with the owner's agreement it now allows a short paragraph or
two with one or two pointers and no list. This moves the bar after seeing the failures, so the case needs a real rerun
(`pnpm eval -- --case says-when-the-idea --trials 3`) to show it still catches a long list of next steps.
