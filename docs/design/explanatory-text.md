# Where explanatory text goes

Part of the [design system](README.md). Read this when deciding whether a piece of text goes on the page, behind an info icon, in tutorial mode, in a notice or on a help page.

## Where explanatory text goes

Text lives in one of four places. Pick by what the person needs it for; how it reads is in the
[style guide](../style-guide.md).

**The test:** if the person skips this text, can they still finish the task without a mistake? If so, it doesn't belong
on the page. Move it to an info icon or a help page, or cut it.

| Where                   | Use it for                                                                                                                                              | Examples from the app                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **On the page**         | What the person needs to act or avoid a mistake _now_: the next step, what they will lose, what a field expects when that isn't obvious                 | The `NextStep` line. “This can’t be undone.” in a delete dialog. A hint under a field: “The address of the site”.                                                         |
| **Behind an info icon** | A short explanation of one control or term that most people won't need every time: why we ask, what a setting changes, what a button will spend or send | The `InfoTip` on Tag… “About tagging several at once”. The AI button's own tooltip: “Uses your Anthropic key, so it costs tokens”.                                        |
| **Tutorial mode**       | The same explanations written out on the page, for people new to the site, switched off once they know their way round                                  | Next to a Critique button: what a critique is and that it sends the draft to your AI. See _Tutorial mode_ below.                                                          |
| **On a help page**      | Anything longer than a short paragraph, anything with steps followed outside the app, anything people come back to                                      | Getting an API key from a provider (`/help/api-key`; the key screen holds only a link to it); what the AI mark means and why critiques are limited (`/help/ai-settings`). |

### On the page

- Short: two sentences at most per block (the length limits are in the style guide).
- Next to the thing it is about, and before the action, not after.
- What the AI button will spend or send is already said by its mark (see _AI buttons_) and its tooltip; don't repeat it
  as a sentence on the page. Something the person **can't take back** is on the page, before the action.

### Feedback after adding something

A form that clears itself still owes the person some sign that it worked, but not a message that sits there for good.

- **The result is on screen** (a note added above its own list, newest first): no visible words. A hidden polite status says
  "Note added." for screen readers, and the new row is marked for a couple of seconds (`accent-wash` and an accent edge,
  fading; the highlighter is for the AI only). Nothing depends on seeing the mark.
- **The result is somewhere else** (Quick add's "Added to X's notes", the reading form's "Added “X”. Open “X”"): the words
  and their link stay, since they point to something not on the page, and go as soon as the person starts the next entry
  or changes tab. Never a timer on text.

### Behind an info icon (`InfoTip`)

- **Text only, two sentences at most**, about one control or term. No links or buttons inside: the tip closes when the
  pointer or focus leaves, so they can't be reached. If it needs a link, it is a help page.
- **Keyboard and touch:** the icon is a real button with a name (`label`, “About tagging several at once”), reached by Tab. The
  tip shows on hover or focus, which a tap gives, and is the icon's description for screen readers.
- **Placement:** the tip slides sideways, and narrows if it must, to stay inside the nearest clipping
  ancestor (the side panel is one), so it is not cropped; the row holding an `Explain` wraps (`flex-wrap`) so the
  written-out text goes under the button, not into a narrow column beside it.
- **Dismissable, hoverable, persistent (WCAG 1.4.13):** Escape closes the tip without moving focus, and it shows again
  on the next hover or focus. The pointer can move from the icon onto the tip without it closing.
- Never the only place for something the person needs to finish the task. That is what the test above catches.

#### Where the icon goes

The icon explains one control or heading, so it sits beside that, and **is never alone on a line**. (The look it
had when it fell on a line of its own, under a heading or a field, was the reason for these rules.)

- **After a button:** `Explain` in the same flex row, right after the button (Critique, Rephrase, New publication).
- **On a heading:** wrap the heading in `HeadingRow` with an `explain` slot: the icon is right-aligned on the
  heading's row. In tutorial mode the text is written out below the heading.
- **On a field:** the field's `explain` slot (with `explain-label`): the icon is at the right end of the label row, and in
  tutorial mode the text is written out under the label.
- **In a toolbar:** `Explain` with `ml-auto`, so it is at the right end of the row (bulk tagging).
- **Not for a whole panel or tab.** The side panel beside a draft is narrow and its tab names say what each is, so its
  explanations are `tutorial-only` (no icon). The same goes for anything that has no single control or heading to
  sit beside.
- **Text that avoids a mistake is plain text** (the hand-over dialog's “It remains yours until they accept it”), not
  behind `Explain`.

`expectNoLoneInfoIcons` (`src/testing/info-icons.ts`) is the test: call it, with tutorial mode off, on any page that
has an icon.

### Tutorial mode

New people need more than the icons give: what each kind of page is for, what the AI buttons do, what they will spend.
Experienced people find that same text noise. So the fuller explanations are written once and shown only in **tutorial
mode**, an account setting (`user_settings.tutorial_mode`) with a **Tutorial** switch in the account area of the menu,
always in view and always available both ways:

- **On for new accounts, off for everyone else by default.** Accounts that predate it stay off, so nobody already
  using the site gets new text on pages they know. A reviewer-only account never has it; when it becomes a full
  account it is turned on, as for any new account.
- **One component, `Explain`,** takes the same `label` and slot as the old `InfoTip`. Off: the icon and bubble. On: the
  same text written out below its control (at the end of its row), in `tutorial-note` (ink-soft, a thin left rule), no icon. `<Explain
tutorial-only>` is for what a page is for, which has no icon: it shows nothing when the mode is off. The text is
  written once, so the two versions can't drift. Two sentences at most in both modes.
- **It never adds anything the person needs to avoid a mistake:** that is on the page for everyone. Review checklist:
  take every `Explain` away; could the person still finish the task and avoid a mistake?
- **Kinds of page.** A route opts in with `meta: { tutorial: true }` and a `name`; the name is its kind. A test
  (`tutorial-routes.test.ts`) requires each opted-in route to have a test that renders it with `tutorialMode: true`.
  The content-crit issue for a page adds `meta.tutorial` with its text.
- **The switch.** The menu's account area has three compact rows: the person's name with the settings gear, **Sign out**, then the **Tutorial** switch (the small size, since the row is crowded) with the **Help** link. Its tooltip
  (`v-tip`) says what it does. It shows the change at once and saves in the background. If saving fails it goes back
  to the saved setting and becomes `aria-disabled` (not `disabled`, so the keyboard can still reach the reason) until
  the page is reloaded, held in the component and not in storage; its tooltip then says so. There is no alert.
- **No offer, no reminders.** Nothing asks the person to turn it off, and nothing turns it back on. The switch is
  always in view, and a person who comes back after a break turns it on themselves. The help page says so.
- **Reviewer-only accounts** have no switch, because no page they can open has tutorial text. The first time one does,
  the switch is added to the reviewer header (beside Help and Sign out).

### Notices

The notice bar (`NoticeBar`) sits at the top of the content column of every signed-in page: in the column, not edge to
edge, and not sticky, so it scrolls away. A page can have more than one; **warn** comes first.

| Kind     | Means                      | Look (`notice` +)                                    | Example                           |
| -------- | -------------------------- | ---------------------------------------------------- | --------------------------------- |
| **warn** | Something needs doing      | `notice-warn`: accent border, `accent-wash` fill     | Please confirm your email address |
| **info** | An offer, nothing is wrong | `notice-info`: `surface` fill, `line` border (quiet) | An offer you have set going       |

- Each is a labelled `region` (not a live region, so it doesn't interrupt a screen reader). The text is short; the
  buttons sit under it and wrap at 390px. An info notice has a short title, one sentence, a primary button and a quiet one.
- A **quiet** page (`meta.quiet`, the editor) shows warn notices but holds back the notice bar's info notices, so nothing interrupts writing. **A notice the page draws about its own subject is not held back**: the editor shows, as notices under the bar, a handover waiting for an answer (warn) and an offer or request the person has set going, with its Withdraw button (info), so they never wonder whether Wordwright forgot what they did. Handover and review are buttons in a quiet row beside “← All drafts” that open dialogs (`ModalDialog`, or `ConfirmDialog` for Ask for this draft), so the writer stays on the draft.
- A notice that can fail says so in a `role="alert"` line with what to do next, and stays.

### Links that open in a new tab

- Use `NewTabLink` for every one. It adds the **new-tab icon** (`Icon name="external"`) after the link text, a tooltip
  (`v-tip`, “Opens in a new tab”: it shows on keyboard focus too) and hidden words “(opens in a new tab)” for screen readers, so the wording and the icon are
  written once. Never write `target="_blank"` or the words in a component.
- The words are never shown on the page. The icon is a convention, so there is no legend; `detail` adds to the spoken
  name where several links read the same (“Open the page”).
- **Exception:** links inside a person's own writing (rendered notes and drafts, and the editors, which open a link on
  Ctrl or ⌘ and click) carry no icon, so prose stays clean. The editor's hint line says how to open them.

### On a help page

- Linked from where it is needed by a **plain link in words** (“How to get an API key”), never by an icon, so it reads
  and is found like any other link. (A link from a help page out to another website is a different thing: it carries the
  new-tab icon like any outbound link.)
- **Opens in the same tab,** with a Back link to where they were. **Except** from a screen holding unsaved input
  (for example connecting your AI key): there it opens in a new tab, and the link says so with the new-tab icon (see
  _Links that open in a new tab_), so nothing typed is lost.
- One topic per page, steps numbered 01, 02 as elsewhere, a title that names the task.
- **Is there a help area yet? Yes.** `/help` lists the pages; each is a view (`HelpApiKeyView`, `HelpPrivacyView`)
  inside `HelpPage`, which supplies the title and a **Back** link (to the page the person was on, or **All help** when
  they came straight here). Help is open to everyone, signed in or not, so it is `meta: { open: true }` and has no
  menu level or step. It is reached from **Help** in the side-menu footer (beside Sign out), the reviewer bar, and under
  the name on signed-out pages. To add a page: a view, a route (before the `/help/:rest(.*)` catch-all), and a line in
  `HelpView`. Functionality that changes must update its help page ([definition-of-done.md](../agents/definition-of-done.md)).
