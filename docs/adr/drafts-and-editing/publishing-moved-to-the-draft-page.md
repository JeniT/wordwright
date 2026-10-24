# Publishing moved to the Draft page (#97)

Publishing is something you do to one draft, not a stage of an idea, and a separate **05 Publish** step listing every
draft sat oddly after Draft. The step, its route and view are gone; each draft's page ends with a publish section
(`DraftPublish`) acting on that draft as it stands on the page, saved or not. `/ideas/:id/publish` redirects to the
idea's drafts so old links work, and the drafts list is the last step.

- **Two copy buttons.** **Copy** puts rich text (`text/html`, from the same safe Markdown renderer as the rest of the app)
  on the clipboard with `text/plain` beside it, so it pastes with its formatting; where the browser can't write rich text
  it copies the plain words instead, and if even that is refused the text is shown to select. **Copy as Markdown** is what
  the old Copy Markdown button did. Plain text is the title, a blank line, then the Markdown body.
- **The Show Markdown toggle went.** The text appears only when the clipboard fails, which is when it is needed.
- **"The next step is to publish it"** (when a draft's critique looks run out) now scrolls to the publish section.
- **Revisit if** publishing straight to a newsletter arrives: it adds buttons to this section, or earns its own page.
