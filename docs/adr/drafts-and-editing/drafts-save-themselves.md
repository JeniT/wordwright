# Drafts save themselves (#299)

The draft editor has no Save button. `useAutosave` (`lib/autosave.ts`) saves about two seconds after typing stops, at once when a field loses focus, the tab is hidden or the page is left, and on Ctrl/⌘+S. Anything that needs the saved words first (Critique, Rephrase, adding a note or link, publishing, **Send for review** (its snapshot is made from the saved draft) and offering or reassigning the draft) calls `flush()`, which saves now if anything is unsaved and rejects if it can't; those steps stop and say so, as they did when Save could fail. Nothing is sent for a draft that was only opened.

- **Failure keeps the words.** A failed save is retried after 4, 8 and 16 seconds while the status says “Not saved yet”. Only when the tries run out is it a raspberry callout with an icon and **Try again** (never colour alone); typing again, or Try again, starts it again. The callout appears only then, not between attempts, because it is an alert and a flash of it would be announced.
- **A conflict (409) stops autosave for good** until the page is reloaded: it is never retried and never overwritten, and the typed words stay on the page. Merging is not attempted. This is the existing version check (#154) with a louder failure mode, since autosave sends more often.
- **Leaving.** Going to another page flushes first; if that fails, the writer is asked whether to leave. Closing the tab asks the browser's own question only while words are unsaved.
- **“Saved” is not announced** to screen readers every time; only the failure callouts are alerts.
- **No history.** Each save replaces the stored draft, so there is no way back to an earlier version except the editor's undo while the page is open. Revisions are a separate idea (#300).
- **Not done:** a blank title is valid, and a title over 300 characters fails like any failed save. No AI is involved; the assistance ladder is unchanged.
