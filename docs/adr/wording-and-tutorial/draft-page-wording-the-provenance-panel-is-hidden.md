# Draft page wording; the provenance panel is hidden (#341, from #338)

- **"Where some of the words came from" is no longer on the draft page.** The `draft_insertions` record and its API stay: they are kept, not displayed. Principle 5 of `docs/responsible-ai.md` is amended to say so. **Flag for the owner:** the principle said provenance is "visible"; it now persists and can be shown again, but the writer does not see it on the page.
- **Critique's privacy note sits beside its button** (as Send does on Refine), and the looks count is its hint text below the row.
- **Tutorial notes** for Comment, Rephrase, and the two side-panel notes were removed; the Rephrase title button has an explanation, and the Formatting help page says what Comment and Rephrase do.

### Draft publish section: one chip, link form folded away (#342)

Once a draft is marked published, the Publish section shows just the green "Published" chip, as the row on the Draft page does; the green box around it said the same thing twice, so `PublishedNote` is gone (readers who aren't the editor see the chip and "View post" in a plain line). Once there is a link, its form folds away behind an edit icon button after "View post"; Save or Escape closes it and focus returns to the button. With no link the form shows, since it is the only way to add one.

### Insert at cursor, and a typing tag filter (#343, part of #338)

- **"Add to draft" is now "Insert at cursor"**, the same icon button, moved to the top of the drag rail. The rail is always drawn for someone who may edit (the button must work on a phone); only its grip is wide-screen. The accessible name is “Insert at cursor: ” plus the item's short label (a note's first words, an article's title).
- **The tag filter is a combobox, not a select.** A text box with a tag icon suggests the tags on that list not yet chosen (substring, ignoring case); Return adds the active suggestion or an exactly typed tag and focus stays for the next. A tag nothing carries is refused with a message rather than creating a filter that can show nothing. Escape closes only the suggestions. Chips and "an item needs all of them" are unchanged.
- **Help page:** no page described either control.

### Edit and delete your own comment (#344, part of #338)

- **Own comments only, while unresolved.** Enforced by `services/comments.ts`, not the UI: someone else's comment, a comment from another review, and the AI's answer 404 (so existence is not given away); a resolved one answers 409. The editor has no power over others' comments: they resolve them. A reviewer can change theirs only while their review is open (`PATCH`/`DELETE /reviews/:id/comments/:commentId`); members and the editor use the draft's routes.
- **Edit changes the words only** (`edited_at` column, shown as a small "edited" mark). Paragraph, hash and marked words stay, so Text changed still compares with the paragraph as it was when first commented.
- **Delete is permanent and uses `HoldButton`.** There are no replies in the model yet, so nothing cascades; a critique look is not given back, as the reading was done.
- **Text changed is a raspberry icon button** (named "Text changed: comment N", tooltip "Text changed") at the right of the card's first line with Edit and Delete. **Add comment** at the top of the Comments tab calls the same `startComment` as the toolbar; it hides while the composer is open so there is only one by that name.
