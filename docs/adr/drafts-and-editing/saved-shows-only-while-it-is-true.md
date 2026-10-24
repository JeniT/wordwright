# "Saved" shows only while it is true (#337, from #279)

- **A form that edits a value says "Saved" only while the form matches what was saved.** `SaveStatus` took the old behaviour (stay until the next save) too literally: "Saved" beside a value that had since been edited told the person the wrong thing. The form passes `:unsaved`; `SaveStatus` hides "Saved" then, and shows it again if the person edits back to the saved value. Errors and the saving words are never hidden. The comparison lives in each form (it knows what "saved" is), not in the component.
- **Save is disabled when there is nothing to save** (unchanged for Name, Username, Details, Description, Critique limit, Idea settings; empty for Email, Password, AI key). This replaces the #239 Description rule ("never greyed out without a reason"), which was a special case: a button that does nothing is a worse hint than a disabled one, and the field itself shows why.
- **Every save button says "Saving…" while it runs**, except the AI key, which says "Checking key…" because that is what takes the time.
- Email and Password clear their fields after success, so their message ("Link sent…", "Password changed…") goes as soon as anything is typed again.
- **No help page change.** No help page describes this.
