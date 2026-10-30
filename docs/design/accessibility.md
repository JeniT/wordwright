# Accessibility checklist

Part of the [design system](README.md). Read this when finishing any screen: focus, targets, saving and loading states, axe.

## Accessibility checklist (all built in; don't undo)

- Contrast: enforced by `palette.test.ts` (text 4.5:1, borders and focus 3:1) in light and dark.
- **Focus:** one 3px outline in `focus`, from the base layer. Don't remove outlines or restyle focus per control.
- **Targets:** buttons 36px (`btn-sm` and icon buttons 32px; the settings gear is 44px, since it sits alone), checkboxes 20px, switches 44px high with their label (44px wide too, except a compact switch in a list row, whose track is smaller but whose target is not). Buttons are below the usual 44px touch size but above WCAG 2.2's 24px minimum.
- **Text:** 16px minimum in fields (stops iOS zoom), links underlined, no text in images.
- **Motion:** reduced motion is honoured globally; don't add animation that carries meaning.
- **Not by colour alone:** errors have words and (where it fits) an icon; AI-suggested things have a label, not just
  the highlighter; the current menu item has `aria-current` and an edge, not only a tint.
- Every async action keeps its loading, empty and error states; error text says what to do next.
- **Saving a form:** show what happened with `SaveStatus` (`:mutation`, or an array of every mutation the form can
  run). It says nothing while idle, "Saved" once it worked (or the words you give it, or its slot for a message that
  says more), and the reason in a `role="alert"` if it failed. A field that starts from a saved value uses
  `useSavedValue`, so a refresh never wipes what the person is typing. For a form that edits an existing value:
  1. **"Saved" shows only while the form matches what was saved.** The form says so with `:unsaved` (a `computed` in
     the form, not logic in `SaveStatus`): "Saved" clears on the first edit and returns if the person edits back to
     the saved value. A failed save's error stays until the next save. (Forms that add something follow
     "Feedback after adding something" instead.)
  2. **The save button swaps to "Saving…" while it runs.** The AI key form keeps "Checking key…". Buttons that start
     an action (Download, Sign out) are out of scope.
  3. **Save is plain `disabled` when there is nothing to save:** unchanged for Name, Username, Details, Description,
     Critique limit and Idea settings; empty for Email, Password and the AI key. (This generalises the Description
     rule from #239: no greyed-out button without a reason.)
  4. **Where the status line goes:** underneath a row of controls (`class="basis-full"` in a wrapping row), above the
     button for stacked fields, and above the button for a longer message in either case.
- **Loading a list or section:** wrap it in `QueryState` (`:query`, `what="the notes"`). It shows a quiet "Loading…",
  or "We couldn't load the notes." with a **Try again** button, and the content only once it has arrived; the empty
  state ("No notes yet.") belongs inside it. Pass `loading` to say what is loading ("Reading your feeds…") and
  `detail` when the server's reason helps ("Too many requests…"). A page about one idea or publication uses `IdeaGate` or
  `PublicationGate`, which also handle "not found".
- **Opening a page by its address:** until the first navigation ends (sign-in check, then the page's code) the app shell
  shows a quiet "Loading…" (`role="status"`) in the main area, so a hard load or deep link is never footer-only. Pages
  need nothing for this; it does not show on later in-app navigations.
- The e2e suite runs axe over the main pages. A new screen needs to be in it.
