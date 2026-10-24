# Reviewing a page's content (a "content crit")

Read this when the owner asks for a content crit, or an issue is labelled `content-crit`.

Each kind of page gets one review of every word on it, filed as an issue labelled `content-crit` (examples: #190,
#201, #213). A review produces an agreed table of changes, not code; the rewrite is the issue it files.

1. **Read first:** [style-guide.md](../style-guide.md) (its checklist is the test), _Where explanatory text goes_ and
   _Tutorial mode_ in [design.md](../design.md#where-explanatory-text-goes), and [CONTEXT.md](../../CONTEXT.md) for
   the words. Then read the page's view, its route (`meta`), its tests, and the pages it links to and from.
2. **List every piece of text**, including labels, hints, buttons, links, empty and error states, and the text the
   shared components add (for example a field's default hint). Read the code, not your memory of the page.
3. **Judge each one** against the style-guide checklist, and give it a level: on the page, behind an info icon,
   tutorial mode, a help page, or cut. Apply the skip test: take the text away; could the person still finish without
   a mistake? If so it is not on the page.
4. **Plan the tutorial text.** Go through the page's elements and ask which a first-time person would not
   understand: what the page is for (`<Explain tutorial-only>`), a term, a field whose purpose isn't obvious from
   its label, a button that sends or spends something, a choice between two paths. Each gets at most two sentences,
   written once (`Explain` shows it as an icon, or written out in tutorial mode). Leave out anything the label or hint
   already says. Text someone needs to avoid a mistake stays on the page; say in the issue that you checked.
   The route gets `meta: { tutorial: true }`, and a test renders it with tutorial mode on.
5. **Look beyond the words.** Two buttons for one action, a duplicated way out, a missing state (loading, empty,
   error), a name that differs from the same thing elsewhere, a missing glossary term, or a flow that would be
   simpler with fewer choices. Note wording in other pages as follow-ups; keep this review to its page.
6. **Grill the owner** (the `grilling` and `domain-modeling` skills; together they are what the owner's
   `/grill-with-docs` runs, which an agent can't invoke) before filing anything. Add any new term to
   [CONTEXT.md](../../CONTEXT.md) as it is agreed. Show the table of text now, problem, and proposal; then ask the
   open decisions as one numbered round, each with your recommended answer worded so "yes" accepts it. Ask only what
   changes the outcome. Look facts up yourself. Repeat until nothing is left assumed.
7. **File one issue** with the agreed table, the `Do` list (including any `CONTEXT.md` terms), acceptance criteria as
   in the [definition of done](definition-of-done.md) (component tests with tutorial mode on and off, e2e where flows
   change, help page if explanation moved there, light/dark/390px, owner reviews the wording), and follow-ups for other
   pages. Part of #175 and #198; label `content-crit`, `enhancement`, `ready`.
