# Rephrase: options for a passage or title (#161, part of #15)

Decided with the owner in triage of #15. Terms (**Rephrase**, **Aim**, **Option**) are in `CONTEXT.md`. Rung 4 of the
assistance ladder. This task is the service; the window is #162, the title entry point #163, social posts are parked (#164).

- **One feature, not four.** Titles, openings, closings and any passage a writer is struggling with are the same thing:
  select the wording, say what it should do, get options. The writer selects text (inside one paragraph, 5 to 150 words)
  or uses the title; there is no separate "opening" or "closing" because we cannot tell whether a writer has written one.
- **The Aim comes first, and is required.** At least three words, in the writer's own words, also for titles. It is
  friction on purpose (docs/responsible-ai.md, principle 3) and what makes the options fit.
- **No per-draft quota (this amends principles 1 and 4 and priority 4 in `AGENTS.md`).** The first plan was a small
  total of option sets per draft. The owner judged a number arbitrary: the cost is the writer's own, and someone who
  wants to game it can. What stays: another round needs a changed Aim (compared ignoring case and spacing, against every
  earlier Aim in the window), and a window allows the number of rounds in the critique-looks account setting (default 3),
  shown as "Round n of 3". That limit is in the window, not on the server, so it is friction and not a guarantee:
  reopening starts again, as adding a new draft gets round the critique limit. Critique's own cap is unchanged.
- **Stateless on the server.** The request carries the rounds already asked (Aim and options), the server checks and
  counts nothing, and the only record will be made when an option is used (#162, a row beside `draft_insertions`).
- **How many, and how long.** Short wording (a title, or up to 25 words) gets a list of about 8 options (5 to 10
  accepted); longer wording gets a carousel of about 4 (3 to 5). An option may be at most the larger of 1.5 times the
  wording or the wording plus 15 words, and a title option at most 20 words, so a phrase cannot become a paragraph.
  Options over the bound, blank ones, repeats, the wording itself and anything already offered are dropped; too few left
  is a 502 telling the writer to try the aim another way. A title needs a draft of about 300 words to work from, since
  titles are best made when the piece is nearly done. **All of these numbers are in `REPHRASE`
  (`packages/core/src/rephrase.ts`)**, to tune in one place. A heading counts by its words; there is no special case.
- **What is sent, and who may ask.** The Aim, the wording, the draft's title and body, the publication description and any
  earlier options in the window, to the writer's own provider. Never notes, brainstorm threads or comments (a test
  fails if they appear). Only the draft's editor can ask, as with critique.
- **Structural and prompt-level.** Structural: the AI has no tool that writes to a draft; the server checks counts,
  lengths and the changed Aim; text enters a draft only by the writer's "Use this". Prompt-level, eval-tested and not
  guaranteed (`prompts/options.md`, `evals/`): options differ in approach, reword without adding facts or quotations,
  say what they cannot supply if the Aim asks for new material, and treat the draft, wording, Aim and publication description
  as data. A prompt change is a product change: the owner reviews it.
- **Not built yet:** the title button (#163); social posts (#164). The window and the record on use are #162, below.

### The Rephrase window and the record on use (#162)

- **A dialog on top of the draft, holding all the state.** The wording, the Aim, the options and the rounds asked live in
  the window (`RephraseDialog`); closing it loses them, and opening it again starts at round 1. The round limit is the
  critique-looks setting (default 3) and a new round needs a changed Aim, both checked in the window. The server only
  checks the Aim has changed between the rounds it is told about, so this is friction and not a guarantee (as decided above).
- **The window reads the saved draft.** The AI is sent the saved draft, so the draft is saved before every request, as for
  a critique. The selection's position is remembered when the button is pressed, and "Use this" replaces exactly that range
  with the writer's words; a passage cannot be edited while the window is open, so the range cannot move. (#244) **Formatting
  stays where it can.** If the whole selection shares its formatting (all italic, or all one link) the new words keep it. If
  some words are formatted and others not, there is no honest way to fit it to different words, so they go in as plain words,
  and the window says so before "Use this" (`RichEditor.hasMixedFormatting`). The marks are set explicitly: left to the
  editor, the words took whatever the first character happened to have. The AI still only offers plain words.
- **Choosing an option is not using it.** An option's button only puts it in the wording field; nothing reaches the draft
  until "Use this". Using an option unchanged is allowed (a forced edit invites a stray space). The window disables "Use
  this" until the wording differs from what was selected.
- **What is recorded, and when.** Only when "Use this" is pressed with words that began as an option (the last one put in
  the wording field, even if it was then edited): `draft_insertions` gets a row with origin `option`, the option as offered,
  the words as used, the Aim and the kind (`passage` or `title`), and who used it. Words the writer wrote themselves leave
  no row. `draft_insertions` was rebuilt (a `CHECK` cannot be widened in place) with `note_id` null for these rows. The
  server cannot check what was offered, so the row is the writer's report, for honesty about origin and not as proof.
  The name follows the #153 rule: kept at account deletion only if the person chose to, otherwise no trace.
- **The draft's list of origins says so.** "Where some of the words came from" now includes these rows ("Words that began as
  an AI option, for “<aim>”", with the person who used it as the chip, and whether they are still as inserted).
- **One modal behaviour.** Focus in, Tab kept inside, Escape, focus back: now `lib/modal.ts`, used by `ConfirmDialog` and
  the Rephrase dialog, so a third dialog does not copy it.
- **Layout.** The button row under the editor now wraps, since a third button no longer fit beside the others on a phone.

### Rephrase for the title (#163)

- **Same window, no new rules.** The title is `kind: 'title'` in the same dialog and endpoint; short options, at most 20 words
  each. The button is beside the title, not among the editor buttons, because it acts on the title and needs no selection.
- **Gated on the draft, not the title.** Titles are best made when the piece is nearly done, so the button waits for
  `REPHRASE.titleMinBodyWords` words of body (and a non-empty title to start from). The server checks the same, before spending.
- **Using an option sets the title and saves**, and is recorded like a passage (kind `title`). The record's "still as inserted"
  check is skipped for titles, since the title is a single field.
