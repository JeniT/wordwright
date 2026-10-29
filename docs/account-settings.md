# Account settings: structure and words

Read this when you change the account settings pages, their menu or their words.

The result of a content crit of `/account`. The page had twelve sections and about twenty blocks of small grey text on one
screen, in the order they were built rather than the order people need them. This note records the structure and the
reasons. The words themselves are in the pages and their tests; the style rules they follow are in
[style-guide.md](style-guide.md), [where explanatory text goes](design/explanatory-text.md#where-explanatory-text-goes) and
[navigation](design/navigation.md#navigation-the-menu-follows-you) (the menu follows you; settings sit apart from the steps).

## Structure

`/account` is six short pages. The side menu has an **account** level that lists them, with the way up "← All publications".
They are plain links, **no 01/02 badges** (settings are not a sequence), the current page is marked with `aria-current`, and
the gear in the menu foot is current across the whole group. Each page is titled with `StepHeading` (an `h1` with "Account
settings" as the small link above it) and ends with `NextStep` (Previous and Next, in menu order). Reviewer-only accounts have no account pages.

| Order | Menu label and `h1`   | URL                 | Sections (h2)                            |
| ----- | --------------------- | ------------------- | ---------------------------------------- |
| 1     | Your details          | `/account/details`  | Name, Email address, Username            |
| 2     | Your AI               | `/account/ai`       | Your AI key (with model), Critique limit |
| 3     | Display               | `/account/display`  | Appearance, Tutorial mode                |
| 4     | Sign-in and security  | `/account/security` | Password, Devices, Invitations           |
| 5     | Download your writing | `/account/download` | (one action)                             |
| 6     | Delete account        | `/account/delete`   | (one form)                               |

**Why this order.** Your AI is second because it is the one thing people must set up to use the product, and the first-run
page already sends them there. Name and email are the next most common edits. Security is a rare, deliberate visit. Delete is
last and alone, so nobody meets it by scrolling past something else.

- `/account` redirects to `/account/details`; the gear keeps pointing at `/account`. Every link to key setup (first-run page,
  "No API key" errors, the help pages) goes straight to `/account/ai`.
- Cut: the "Your account" header block (name, email and "Linked sign-in" repeat what is elsewhere; the sign-in method moves to
  Sign-in and security) and the "Publications" section (its only content, the handle, is explained under Username).

## Words: the choices that are not obvious

- **Names say what a section holds.** "AI assistant" (a banned word) became "Your AI key"; "Critiques of a draft" became
  "Critique limit"; "Who can invite you" became "Invitations"; "Where you're signed in" became "Devices". Every save button
  says what it saves.
- **Two sentences or fewer per block, success is one word, no small print.** What was cut: "updates everywhere" and "emails
  already sent keep the old one" (Name); the AI-mark paragraph and the long privacy block (Your AI, which links to the help page
  instead); the explanation of why the critique limit exists moved behind an info icon.
- **Delete account:** "This can't be undone. Download your writing first." The confirmation dialog lists what goes
  (publications only you belong to, your ideas, notes and drafts, your saved AI key) and repeats the name choice. After
  deleting, the person lands on Create account with "Your old account has been deleted." (`/register?deleted=1`, a flag with no personal
  data, dropped from the Sign in link; #430). The form asks for the password (no "confirm your
  email" field; see [Account deletion semantics](adr/accounts-and-security/account-deletion-semantics.md)); someone with no
  password is told to add one first. The “Your name on what you wrote” choice keeps or hides the person's display name only: the legend
  promises email and username are never kept. The app has several owners, not a transfer action, so the sole owner of a shared
  publication is told to make someone else an owner.
- **Invitations** is a switch ("Block all invitations": a state, not a selection) with the hint "Senders aren't told."
- **Appearance** has no legend: the options are "System", "Light mode" and "Dark mode", with "Applies on this device" behind an
  info icon.

## Decisions

- **Sub-pages, not tabs or one long page.** The menu already follows you, so a level for account settings fits it. Tabs wrap
  badly at 390px and don't deep-link; a jump list on one page is still long.
- Also decided in this crit, recorded where they live now: the editable brainstorming prompt was removed
  ([#205](adr/ai-and-brainstorm/a-persons-brainstorming-prompt-removed.md)); the model is chosen from what the provider offers
  ([#206](adr/ai-and-brainstorm/the-model-is-chosen-from-what-the-provider-offers.md)); passwords are 8 to 128 characters with no
  composition rules, and nobody should add further checks (breach lists, character classes) without a decision
  ([Passwords](adr/accounts-and-security/passwords-scrypt-from-nodecrypto.md)); deleting an account needs the password.
- **Roles on Home** (owner or member badges on publications) is a separate task: the delete wording makes it matter whether you
  are an owner or a member of each publication.
