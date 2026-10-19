# Style guide: the words in the app

How Wordwright speaks. Read this before you write, critique or rewrite any text people see: labels, buttons, headings,
instructions, empty states, errors, emails. One guide, so the owner can correct it once and every agent follows.

**How it relates to [design.md](design.md).** `design.md` decides _where_ text goes (on the page, behind an info icon,
or on a help page: see [Where explanatory text goes](design.md#where-explanatory-text-goes)). This file decides _how it reads_. Both apply.

**What it does not cover.** The AI's own instructions in `prompts/` have their own [README](../prompts/README.md). What
the AI says to the writer is shaped by those prompts and by [responsible-ai.md](responsible-ai.md), not by this guide.

**Words for things** come from [CONTEXT.md](../CONTEXT.md). If you need a word it doesn't have, add it there first.

Every rule has an example. Examples marked _Before_ are from the app as it was; _After_ is what to write.

## Voice and tone

Plain, friendly, calm, like a good editor talking to a colleague. The writer is the author; the app is a tool.

- **Plain English.** Short words, no jargon. If a term is needed, it is one from CONTEXT.md.
  - Before: “Authenticate with your provider's token”
  - After: “Paste your API key”
- **Say you, to the writer.** “We” is allowed only for the service doing something (“We check that it works before
  keeping it”). The AI is “your AI”, never “I” or “we”, and has no personality.
- **No hype, no engagement.** No “powerful”, “smart”, “magic”, “AI-powered”, no streaks, nudges or guilt. We want the
  writer to finish and leave ([responsible-ai.md](responsible-ai.md)).
  - Before: “Unlock smarter drafts with AI-powered suggestions!”
  - After: “Critique reads your draft and comments on its weakest points.”
- **No exclamation marks and no emoji.** Success is stated plainly: “Saved”, not “Saved!” or “Great job!”.
- **Never speak as the writer.** Nothing the app says is written to be published as theirs. The AI points and asks;
  it doesn't hand over replacement text in its own voice.
  - Before: “Here's a better opening for you”
  - After: “Three different approaches to this opening. Pick one to edit.”
- **British English**, sentence case, curly quotes and apostrophes (“ ” ’): recognise, colour, organise.
  - Before: “Give it a name you'll recognize”
  - After: “Give it a name you’ll recognise”
- **Sentence case everywhere**: buttons, labels, headings, menu items. Only proper nouns take capitals.
  - Before: “Add A New Note”
  - After: “Add a note”
- **Name the AI plainly.** “Your AI” in general; “Anthropic” only where the provider matters (billing, privacy, getting
  a key). Never “the assistant”, “the bot” or “Claude says”.

## Instructions and steps

Lead with what the person does. Say why only when it changes what they do.

- **One action per sentence, starting with a verb.**
  - Before: “Go to the Anthropic Console and sign up or sign in. This is separate from a Claude chat subscription, so
    you may need a new account even if you already use Claude.”
  - After: “Sign in to the Anthropic Console. A Claude chat account won’t work here.”
- **Number real sequences as 01, 02, 03** (as the side menu does). A step is one thing to do, not a paragraph. No more
  than five steps on one screen; more than that is a help page.
- **Put the reason after the action, and only if it changes what they do.**
  - Before: “Copy the key straight away. The Console only shows it once, and it starts with sk-ant-.”
  - After: “Copy the key now. The Console shows it only once.” (“It starts with sk-ant-” earns a place only if people
    paste the wrong thing.)
- **Say what will happen next** when it can’t be undone, before they press the button. (An AI button already carries
  the AI mark and a tooltip about the cost; don’t add a sentence for that.)
  - After: “This can’t be undone. Its 3 comments go too.”
- **Say what a term is only where it is skippable.** “A publication is a place you publish, like a Substack or a
  blog” is not needed to press “New publication”, so it goes behind an info icon (written out in tutorial mode), never
  in a paragraph. Don’t use a word that is not in CONTEXT.md to explain one that is (“readers”, for a publication).
- **Don’t tell people they may do things in any order.** If nothing is locked, saying so is noise.
- **Don’t explain what the screen already shows.**
  - Before: “This is the page where you can see all your drafts.” (under the heading “Drafts”)
  - After: (nothing)

## The parts of the screen

### Buttons

A verb and what it acts on, in sentence case. The label says what _will happen_.

- **Be specific.**
  - Before: “Submit”, “OK”, “Yes”
  - After: “Save note”, “Send for review”, “Delete draft”
- **Match the action's name in CONTEXT.md**: “Use this” on an option, “Resolve” on a comment, “Replace wording”.
- **Keep it short**: one to three words, four at most. Where the surrounding heading gives the object, the verb alone
  is fine (“Add”, under “Notes”).
- **Cancel is “Cancel”.** It dismisses without doing anything.
- **One name for one action.** The same action has the same label wherever it appears, and a page never offers two
  buttons for it. If the page already has one, the second goes.
  - Before: “Start a publication” in the first-run steps, “New publication” beside the list.
  - After: “New publication” in both, and only one of them on the page at a time.
  - The agreed names are listed under _Names of actions_ below.

### Links

Say where they go, not “click here” or “read more”. A link in running text uses the words of its destination.

- Before: “For more information, click here.”
- After: “See how to get an API key.”

### Labels and hints

- **A label names the field**, in a noun or short phrase: “Publication name”, “Aim”. No colon, no full stop.
- **A hint says what is expected** only when it isn’t obvious: “The address of the site, for example example.com”. It
  is a phrase, not a lecture.
- **Placeholders are never the only label** and never carry instructions.

### Headings

- **Say what is on the page.** A noun phrase, or the verb phrase of the main task.
  - Before: “Welcome to your amazing space!”
  - After: “Your ideas”
- **Short.** Five words or fewer. Sentence case. No full stop, no question unless the question is the page (“What should
  it do?” on the Aim).
- **Don’t greet.** No “Welcome, Ada” above the work: it is flattery, it lengthens the heading, and it has to change
  as the page does. A first-run block is headed by what it is: “Get started”.
- **One `h1`.** Headings aren’t for decoration or for emphasis; see _Length and scannability_.

### Empty states

Say what is empty, then the one thing to do. Don’t praise the emptiness or explain the whole feature.

- Before: “Nothing to see here yet! Why not get started by adding something?”
- After: “No drafts yet. Start one when you’re ready to write.”

### Error messages

Say what happened, then what the person can do next. Never blame them, never show codes or internals, never leave
them at a dead end.

- **What happened, in their terms.** The thing, not the mechanism.
  - Before: “Error 500: Request failed”
  - After: “Couldn’t save that. Try again.”
- **What to do next**, as the last sentence: try again, check a field, wait, or where to go.
  - Before: “Too many attempts.”
  - After: “Too many attempts. Try again later.” (Say how long if we know: “Try again in an hour.”)
- **Apologise when it is our fault, and ask politely for something after it.** A server fault or an outage gets
  “Sorry”, and then “please” for what we ask them to do. Anything they can fix, or anything that is simply a limit,
  gets neither.
  - Our fault: “Sorry, we couldn’t save that. Please try again.”
  - Their input: “That email address doesn’t look right. Check it and try again.”
  - A limit: “You have added a lot of sources. Try again later.”
- **Name the field and the fix** for validation, next to the field, never only in colour (see `design.md`).
  - Before: “Invalid input”
  - After: “Enter an address that starts with https://”

### Confirmation and success

- **Success is one word or a short phrase, past tense:** “Saved”, “Note deleted”, “Invitation sent”. Nothing more.
- **Confirmations name the thing and the consequence, and the button repeats the verb.** Never “Are you sure?” with
  Yes/No.
  - Title: “Delete “Why we write”?”
  - Body: “This can’t be undone.” (Or what else goes with it: “Its 3 comments go too.”)
  - Buttons: “Delete draft” and “Cancel”.
- **Don’t confirm what is harmless or reversible.** Offer Undo instead.

## Length and scannability

People scan; they don’t read screens. Fewer words, then structure.

- **One idea per sentence; about 20 words at most.** Break the rest.
- **A text block is two sentences or fewer.** Beyond that, make it a list of steps or move it to a help page.
- **No more than three blocks of text above the first thing the person can do.** The key setup today has five long
  steps, two paragraphs and a privacy callout above the field. Reduce to the steps they must follow, and move the rest.
- **Anything longer than a short paragraph, or followed outside the app, goes on a help page**, linked by a plain link.
  The test from `design.md`: if the person skips it, can they still finish without a mistake? If yes, it doesn’t belong
  on the page.
- **Headings are for navigating**, one per section a person might jump to. A heading over a single sentence is a sign
  the sentence is the wrong size.
- **Bold is for the one thing to notice** in a block, once. Never a whole sentence, never several.
  - Before: “**Use an API key** from the Console, **not a Claude chat subscription**. **Know how long it is kept.**”
  - After: “Use an API key from the Console, not a chat subscription.” (one bold phrase at most, or none)
- **Lists for steps and parallel items only.** Three or more things of the same kind; otherwise a sentence.
- **Text in sibling blocks is styled alike.** Two steps of one list have the same size and colour of body text; if
  one is small and soft, so is the other, and that is a sign it should not be on the page.
- **No small print.** Secondary text (`text-sm`, `ink-soft`) is for dates, counts and brief hints. If it matters, it
  isn’t small.

## Words we use and avoid

The domain words are in [CONTEXT.md](../CONTEXT.md), each with the words _not_ to use for it. Beyond those:

| Use                             | Instead of                                         |
| ------------------------------- | -------------------------------------------------- |
| your AI                         | the assistant, the bot, AI-powered, smart          |
| comment (what a critique makes) | suggestion, feedback item, point                   |
| option (what Rephrase offers)   | suggestion, alternative, prompt result             |
| Aim                             | prompt, instruction, brief                         |
| Delete (can’t be undone)        | Remove (for a list item that only leaves the list) |
| Remove                          | Delete, where the thing still exists elsewhere     |
| Sign in / Sign out              | Log in / Log out                                   |
| email address                   | email (as a noun for the address)                  |
| Couldn’t                        | Failed, Error, Unable to                           |
| Try again later                 | Please retry                                       |

### Names of actions

An action that appears in more than one place has one name, used for every control that does it: the button, the
tab that opens its form, an icon-only button's tooltip, and the start of its accessible name. Before naming a control,
search the app for the action; if it is here, use this name. Add new ones here when you agree them.

| Action                                                | Name                    | Notes                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Put a post or article on a reading list (#272)        | **Add to reading list** | The form's button, the Quick add tab _and_ its button, the research result's accept button (an icon, as on Search), and the tick on recent posts and Search results. An icon-only tick's tooltip is the name, and its accessible name is “Add to reading list: {title}”. No “the”. |
| Start a draft on an idea (#232)                       | **New draft**           | The button on an idea's landing page and on its Draft step. Opens the editor.                                                                                                                                                                                                      |
| Begin the conversation with your AI on an idea (#232) | **Refine with your AI** | The button on an idea's landing page, where it only starts the conversation (the AI speaks first). The Refine step's own button still says “Start brainstorming” until its crit.                                                                                                   |

Quick add's other tabs follow a different pattern, on purpose: the tab is “Add a note” and its button “Add note”, the
tab “New idea” and its button “Create idea”. Those are two names for the tab and the button, not one for the action, so
don't copy that pattern for a new action: give the tab and the button the same name.

## Checklist for a content crit

Run this against any text before committing it, and when critiquing someone else’s.

1. **Whose words?** Does it keep the writer as the author and avoid selling, nudging or flattering?
2. **Can they act?** Does it begin with what to do? One action per sentence?
3. **Is it the right size?** Under the limits in _Length and scannability_; nothing they could skip without making a
   mistake?
4. **Does every error say what happened and what to do next**, and apologise only where it was our fault?
5. **Is the label specific?** Would a screen-reader user hear a verb and an object?
6. **Are the words ours?** Checked against CONTEXT.md and the table above; British spelling, sentence case, curly
   quotes, no exclamation marks.
7. **Is it in the right place** (page, info icon or help page)? See [design.md](design.md#where-explanatory-text-goes).
8. **Read it aloud.** If you run out of breath, cut.

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

| Was                                                                                                  | Rule it broke                           | Now                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Four sentences above the form, including what is sent (again)                                        | Length; skippable text; said twice      | One tutorial-only sentence; what is sent stays in the form's one line                                      |
| “Add”, “Ignore”, “Reconsider” as text buttons                                                        | One name for one action                 | Icons with the agreed names: “Add to reading list”, “Ignore”, “Take off the reading list”, “Stop ignoring” |
| “Why the AI suggests it (unchecked):” and “The search called it:”                                    | Small print; says what the mark can say | “Your AI’s reason:” in the highlighter; the second line cut                                                |
| “Problem: we couldn't find a website at this address, so the page may not exist. It can't be added.” | Errors say what happened and what to do | “We couldn’t find a website at this address, so it can’t be added.”                                        |
| “Researched by Ada on 03/01/2026 · claude-sonnet-5-5”                                                | Detail nobody acts on                   | “Ada · 3 Jan 2026”                                                                                         |
