# Account settings: structure and words

The result of a content crit of `/account`. The page had twelve sections and about twenty blocks of small grey text on
one screen, in the order they were built rather than the order people need them. This note records the new structure,
the new words and the decisions behind them. The work is split into tasks (see _Tasks_); each one links here.

Rules this applies: [style-guide.md](style-guide.md) (length, one-word success, button names, no small print),
[design.md](design.md#where-explanatory-text-goes) (what goes on the page, behind an info icon, or on a help page) and
[design.md](design.md#navigation-the-menu-follows-you) (the menu follows you; settings sit apart from the steps).

## Structure

`/account` becomes six short pages. The side menu gets an **account** level: it lists the six pages, with the way up
"← All publications". They are plain links, **no 01/02 badges** (settings are not a sequence), the current page is marked
with `aria-current`, and the gear in the menu foot is current across the whole group. Each page is titled with
`StepHeading` (an `h1` with "Account settings" as the small link above it) and has no `NextStep`. On phones the menu folds
behind the Menu button as at every other level. Reviewer-only accounts still have no account pages.

| Order | Menu label and `h1`   | URL                 | Sections (h2)                            |
| ----- | --------------------- | ------------------- | ---------------------------------------- |
| 1     | Your details          | `/account/details`  | Name, Email address, Username            |
| 2     | Your AI               | `/account/ai`       | Your AI key (with model), Critique limit |
| 3     | Display               | `/account/display`  | Appearance, Tutorial mode                |
| 4     | Sign-in and security  | `/account/security` | Password, Devices, Invitations           |
| 5     | Download your writing | `/account/download` | (one action)                             |
| 6     | Delete account        | `/account/delete`   | (one form)                               |

**Why this order.** Your AI is second because it is the one thing people must set up to use the product, and the
first-run page already sends them there. Name and email are the next most common edits. Security is a rare, deliberate
visit. Delete is last and alone, so nobody meets it by scrolling past something else.

- `/account` redirects to `/account/details`. The gear keeps pointing at `/account`.
- Every link to key setup (first-run page, "No API key" errors in `CommentsPanel` and `ResearchForm`, the help pages) goes
  straight to `/account/ai`. The old `#download` anchor becomes a link to `/account/download`.
- Cut: the "Your account" header block (name, email and "Linked sign-in" repeat what is elsewhere; the sign-in method moves
  to Sign-in and security) and the "Publications" section (its only content, the handle, is explained under Username).

## Words

Written to the style guide: sentence case, curly quotes, success is one word, a block is two sentences or fewer.
ⓘ means behind an info icon (`InfoTip`).

### Your details

| Section       | Words                                                                                                                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Name          | Field "Name", hint "Other people see this on your notes, messages and invitations." Button "Save name". Success "Saved". (Cut: "updates everywhere", "emails already sent keep the old one".)                                                                                                                                        |
| Email address | Current address on its own line. Fields "New email address" and "Password"; hint "We'll email a link to the new address. It changes once you open it." Button "Send confirmation link". Success "Link sent to x@y.com. Open it within 24 hours." Google-only: "To change it, first add a password in Sign-in and security." (a link) |
| Username      | Field "Username", hint "Used in URLs, for example ada-substack". ⓘ "Existing publications keep their addresses. A username you stop using can't be taken by anyone else." Button "Save username". Success "Saved". The first-run "Choose your username" on Home keeps its own wording.                                               |

### Your AI

| Section        | Words                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Your AI key    | One line "Your AI uses your own Anthropic key, so Anthropic bills you, not us." Links "How to get an API key" and "Privacy advice". Status "Key saved (…abcd)" or "No key yet". Fields in this order: "Anthropic API key" (when one is saved: "New API key", hint "Leave blank to keep the current one"), then "Model". Buttons "Save key" and the hold-to-confirm Remove. ⓘ beside the heading links to the help page "Your AI settings" (what the AI mark means). The AI-mark paragraph and the long privacy block leave the page. |
| Model          | See _Model choice_ below. "Save a key to choose a model." when there is no key.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Critique limit | Field "Critiques per draft", hint "Also limits how many times you can ask for options for ways to rephrase parts of your drafts." ⓘ "An AI editor can always find more to change, and each round can take a draft further from your voice. When a draft's critiques are used up, the next step is to publish." Button "Save limit".                                                                                                                                                                                                  |

The **Brainstorming prompt** section is removed (see _Decisions_).

### Display

| Section       | Words                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| Appearance    | No legend: the options are "System", "Light mode" and "Dark mode". ⓘ beside the heading "Applies on this device." |
| Tutorial mode | The switch "Tutorial mode", the line "Explains each page as you go." and the link "About tutorial mode".          |

### Sign-in and security

| Section     | Words                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (top)       | A status line: "You sign in with email" or "You sign in with Google".                                                                                                                                                                                                                                                                                                                                                        |
| Password    | With a password: "Current password", "New password", hint "At least 8 characters. Your other devices will be signed out." Button "Save password". Success "Password changed. We've signed out your other devices and emailed you a notice." Google-only: "Add a password to sign in with email too. We'll email a link to x@y.com." Button "Email me a link". Success "Link sent. Opening it signs you out of your devices." |
| Devices     | "Sign out a device you've lost or shared." No info icon. The list, per-row Sign out and the confirm dialog are unchanged.                                                                                                                                                                                                                                                                                                    |
| Invitations | A switch (a state, not a selection) "Block all invitations", hint "Senders aren't told." Empty list "No one blocked. Use Decline in an invitation email to block its sender." Unconfirmed email: "Confirm your email address first."                                                                                                                                                                                         |

### Download your writing

"A zip of Markdown files: your ideas, notes, lists of articles and drafts. Comments, reviews, brainstorming and keys aren't
included." ⓘ "Owners get every draft in a publication. Members get the drafts they edit or started." Button "Download as a
zip". The per-publication download in publication settings is unchanged.

### Delete account

- "This can't be undone. Download your writing first." ("Download your writing" links to `/account/download`.)
- "Deletes your account and any publication only you belong to. You're removed from shared publications. If you're the only
  owner of one, you can't delete your account until you make someone else an owner." (The app has several owners, not a
  transfer action; the error already names the publication.)
- Fieldset legend "After you leave", no hint. Radios: "Keep my display name on my notes and comments in publications that
  continue" and "Show them as “a former member”". ("Display name" carries the promise that email and username are never
  kept.)
- Field "Password". No "confirm your email" field. Button "Delete account".
- Someone with no password sees "To delete your account, first add a password in Sign-in and security." instead of the form.
- Dialog: title "Delete your account?", body "This can't be undone.", buttons "Delete account" and "Cancel".

### Names

"AI assistant" (a banned word) becomes "Your AI key"; "Critiques of a draft" becomes "Critique limit"; "Who can invite you"
becomes "Invitations"; "Where you're signed in" becomes "Devices". Every save button says what it saves.

## Decisions

- **Sub-pages, not tabs or one long page.** The menu already follows you, so a level for account settings fits it. Tabs
  wrap badly at 390px and don't deep-link; a jump list on one page is still long.
- **Brainstorming prompt: removed.** The editable prompt was the longest, least used section, and a personal prompt can
  quietly pull the AI away from the rung the product claims. Everyone gets the default (the app's own rules were always
  added after it). A migration deletes stored custom prompts: hidden personal data nobody can see or use isn't kept.
  This changes how the AI behaves for anyone who customised it, so the task asks the owner to review.
- **Model choice: discovered, not hard-coded.** The list comes from the provider's models endpoint through a new `listModels`
  method on the AI port (Anthropic adapter, fake, and a case in the shared contract suite). Our hand-written "balanced /
  cheapest" labels go. We never evaluated every model's behaviour anyway; the evals are best-efforts, so a curated list
  gave false assurance, and a hard-coded list means a code change whenever a model appears.
  - It needs the person's own key, so the model field appears once a key is saved ("Save a key to choose a model.").
  - If the list fails to load, the section shows the current model by name and "Couldn't load models. Try again."
  - A saved model the provider no longer offers stays shown, with "This model is no longer offered. Choose another."
  - `DEFAULT_LLM_MODEL` stays as the default until someone chooses. Saving checks the id against the live list, using the
    call that already checks the key. The list is fetched when the page loads, with no background refresh.
- **Passwords: 8-character minimum, 128 maximum, no composition rules.** One `PasswordSchema` for registration, reset and
  change. The maximum bounds the cost of hashing; the minimum stays because an account whose owner's key spends money
  should not be protected by one character. Existing longer passwords keep working. The hint stays on the page because a
  length rule isn't obvious. Nobody should add further checks (breach lists, character classes) without a decision.
- **Deleting an account needs a password.** The typed-email check is not a security check: the email is on the account
  page. Password accounts re-enter their password; Google-only accounts add a password first, as changing an email
  already requires. `confirmEmail` is removed from the API.
- **Roles on Home** are a separate task: the delete wording makes it matter whether you are an owner or a member of each
  publication, so the cards should show it.

## Tasks

Filed as GitHub issues, each referring to this note.

1. Remove the brainstorming prompt option (backend, a deleting migration, docs, tests).
2. Discover available models (port method, adapter, fake, contract test, endpoint).
3. Passwords: 8-character minimum.
4. Deleting an account needs a password.
5. Account settings: sub-pages and menu (level, routes, redirect, retargeted links, existing sections moved unchanged, tests, `design.md`).
6. Account settings: copy pass for Details, Display, Security, Download and Delete. Needs 5 (and 4 for Delete).
7. Account settings: Your AI page and the help page "Your AI settings". Needs 1, 2 and 5.
8. Home: owner and member badges on publications (to be shaped later).
