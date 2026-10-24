# Style guide: worked examples

Read this when you run a content crit ([content-crit.md](agents/content-crit.md)) and want a model of one. Each table is a past crit: the text as it was, the rule from the [style guide](style-guide.md) it broke, and what replaced it.

## Worked example: the first-run checklist on Home

The crit of [#190](https://github.com/JeniT/wordwright/issues/190), as a model for the next page.

| Was                                                                                          | Rule it broke                                     | Now                                                                                                                 |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| “Welcome, Ada. Two steps to get going” (and “One more step…” after one was done)             | Don’t greet; headings five words or fewer         | “Get started”                                                                                                       |
| “A publication is a place you publish… It keeps its own ideas, readers and drafts together.” | Skippable text off the page; unclear word         | One sentence behind an info icon (“About publications”); the second one is cut                                      |
| “You can do the steps in either order…”                                                      | Don’t tell people they may do things in any order | Cut                                                                                                                 |
| “Start a publication” beside “New publication”                                               | One name for one action                           | “New publication”, once                                                                                             |
| A “Your publications” heading and button over an empty list                                  | Don’t explain or show what the screen lacks       | Shown only once there is a publication (kept, hidden, as the page’s `h1`)                                           |
| Step 1 body text normal, step 2 body text small and soft                                     | Text in sibling blocks is styled alike            | Both normal                                                                                                         |
| Three small paragraphs above the key field                                                   | No small print; length limits                     | A link to how to get a key, then “AI functions use Anthropic, which will bill you for your use.” and a privacy link |

## Worked example: the new publication page

The crit of [#213](https://github.com/JeniT/wordwright/issues/213).

| Was                                                                                | Rule it broke                                  | Now                                                                                                                |
| ---------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Three sentences of intro, ending “You can describe it as you create it, or later.” | Skippable text off the page; explains a button | One sentence in tutorial mode only, the same as Home’s “About publications”                                        |
| “Its address will be /p/…”                                                         | Fails the skip test                            | Cut                                                                                                                |
| “Create publication” beside “Create and describe it”                               | One name for one action                        | One “Create publication”; describing is the new publication’s next step                                            |
| “← Your publications” beside “Cancel”                                              | Two ways out                                   | “Cancel”                                                                                                           |
| “…but its picture couldn't be uploaded: … Go to your publication or try again.”    | Errors say what happened, then what to do      | “Your publication was created, but we couldn’t upload its picture. {reason} Try again, or go to your publication.” |

## Worked example: the research page

The crit of [#202](https://github.com/JeniT/wordwright/issues/202).

| Was                                                                                                  | Rule it broke                           | Now                                                                                             |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Four sentences above the form, including what is sent (again)                                        | Length; skippable text; said twice      | One tutorial-only sentence; what is sent stays in the form's one line                           |
| “Add”, “Ignore”, “Reconsider” as text buttons                                                        | One name for one action                 | Icons with the agreed names: “Add article”, “Ignore”, “Take off the articles”, “Stop ignoring”  |
| “Why the AI suggests it (unchecked):” and “The search called it:”                                    | Small print; says what the mark can say | The reason in the highlighter, with one highlighted line saying what it is; the second line cut |
| “Problem: we couldn't find a website at this address, so the page may not exist. It can't be added.” | Errors say what happened and what to do | “We couldn’t find a website at this address, so it can’t be added.”                             |
| “Researched by Ada on 03/01/2026 · claude-sonnet-5-5”                                                | Detail nobody acts on                   | “Ada · 3 Jan 2026”                                                                              |

## Worked example: the Refine page

The crit of [#283](https://github.com/JeniT/wordwright/issues/283) (rewrite #288).

| Was                                                                                                                                 | Rule it broke                                                      | Now                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Three sentences above everything: what your AI does, what is sent, and that suggestions need accepting                              | Length; skippable text; said again by the cards                    | One tutorial-only sentence; what is sent is beside the button that sends it                                                            |
| **Start brainstorming** under “Talk it through” and a paragraph                                                                     | One name for one action; explains the screen                       | **Refine with your AI**, laid out as on the idea’s landing page, with its one-line privacy text beside it                              |
| “Coach”, “The coach is replying…”, “Your coach hasn’t replied…”                                                                     | Words are ours: it is “your AI”                                    | “Your AI”, “Your AI is replying…”, “Your AI didn’t reply to your last message.”                                                        |
| **I have enough: go and write** beside **Send**                                                                                     | Two ways out                                                       | Cut: the page ends with “Next: 05 Draft”                                                                                               |
| A hand-built red box and **Go to account settings**                                                                                 | Errors: words and an icon; one name for a link                     | A raspberry callout with an icon; **Add your AI key**, or “Your AI provider didn’t accept your key. Check it in your AI key settings.” |
| “Problem: we couldn't find a website at this address, so the page may not exist. It can't be added.”                                | Errors say what happened and what to do                            | “We couldn’t find a website at this address, so it can’t be added.” with an icon                                                       |
| “Why the AI suggests it (unchecked):”, “The AI called it:”                                                                          | Small print; says what the mark can say                            | The reason in the highlighter, with one highlighted line saying what it is                                                             |
| 📝 before each recorded note                                                                                                        | No emoji                                                           | An icon                                                                                                                                |
| The idea’s title, notes and links in a panel above the conversation, “Refine started by Ada”, and the model’s name beside “Your AI” | Don’t explain what the screen already shows; detail nobody acts on | Cut: the notes are a click away, the AI is sent them anyway, and nobody acts on which model replied (#292)                             |
