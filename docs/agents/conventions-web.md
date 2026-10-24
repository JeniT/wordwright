# Conventions for the web app

Read this when you add or change code in `apps/web`. For anything people see, read [design.md](../design.md) too,
and [style-guide.md](../style-guide.md) before writing or changing any of its words.

`apps/web` is Vue 3 + Vite + Pinia + TanStack Query + Tiptap + Tailwind v4. `lib/api.ts` is the only place that
calls the API, and it validates responses with the shared schemas. `src/theme/` is the design: the colour palette
(`palette-ember.css`, the only place a colour is chosen) and the components built on it (`theme.css`).

- **Web queries:** query keys and the queries screens share (`useIdea`, `useIdeas`, `useIdeaNotes`, `useSources`,
  `useDraft`) live in `apps/web/src/lib/queries.ts`. Take keys from there, never a key literal in a component; refresh
  with `invalidateRoots` / `refreshNotesEverywhere`.
- **Loading and errors:** wrap anything fetched with `useQuery` in `QueryState` (or `IdeaGate` / `PublicationGate`
  for a whole page), which supplies the loading and error text.
- **Saving:** show a form's result with `SaveStatus`, and fill fields from saved values with `useSavedValue`
  (`lib/forms.ts`), which supply the "Saved" and error text.
- **Editing in place:** use `useInlineEdit` (`lib/inline-edit.ts`) so focus goes into the field when the form opens
  and back to the button that opened it when it closes.
- **e2e and saving:** the app shows a change at once and saves it in the background. `e2e/fixtures.ts` makes
  `page.reload`, `goBack` and `goto` wait for pending saves automatically; use `savesAnswered(page)` before any other
  step that must see the saved state (for example setting up a route).
- **Help area:** `/help` (`apps/web/src/views/Help*View.vue`, framed by `components/HelpPage.vue`; the list is in
  `HelpView.vue`). Longer or outside-the-app explanation lives there, not on the page
  ([design.md](../design.md#where-explanatory-text-goes)).
- **Reorderable lists:** use `ReorderableList` for any list whose order people can change, so they all look and
  behave alike.
- **Controls in lists:** full rules in [design.md](../design.md#actions-and-lists). In short: checkboxes only
  _select_; a state of an item or the view is a **switch** (`SwitchField`); actions are buttons; removing is a
  `HoldButton`; long lists page with `usePaging` + `PageNav`.
- **Navigation:** a new page declares `meta: { level, step }` on its route, titles itself with `StepHeading`, and
  ends with `NextStep` where a next step makes sense. Numbered steps are always links, never locked; a step that
  calls the AI waits for a button (visiting spends nothing); pages read beside another window set `compact: true`.
  The drafting notes own the `complementary` landmark, so a new page uses no second `aside`. Full rules in
  [design.md](../design.md#navigation-the-menu-follows-you). Help pages sit outside the levels
  (`meta: { open: true }`, framed by `HelpPage`, no step).
- **Styling:** use **roles** (`bg-surface`, `text-ink-soft`, `border-line-strong`, `text-danger`, `bg-accent-wash`)
  and the **component classes** (`btn`, `field`, `panel`, `card`, `chip`, `callout`), with `rounded-ctl` /
  `rounded-panel`. Tailwind's default palette is switched off, so `bg-stone-100` does nothing; dark mode lives in the
  palette file, so a component has no hex value or `dark:` variant. No shadows or gradients; one sans typeface,
  in the editor and chat too. The **highlighter** (`chip-ai`, `bg-mark`) marks only what the AI suggested. Errors use
  `danger` with words and an icon. Other websites' icons and logos go through `PublicationImage kind="source"`.
  When a role, component or rule is missing, add it to `theme/` (and the palette test) and update
  [design.md](../design.md#components-utilities-in-themecss); one screen keeps the shared look.
