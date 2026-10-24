# Ideas on the publication's page (#252)

- **Ideas are no longer a step.** They are listed (all of them, unnumbered) on the publication's landing page, under Quick add, with the tick boxes and
  **Move to…** the Ideas page had. The menu has three steps, 01 Search, 02 Read and 03 Notes, which sit on the landing page under "Stuck for ideas?"
  with a line of tutorial-mode text each (`LandingSection`'s `explain`, `nested`).
- **`/p/:id/ideas` and `/p/:id/ideas/new` redirect to the landing page.** New ideas start in Quick add's New idea tab (a name alone); the separate
  "New idea" form, which also took first notes, is gone. The API still accepts `notes` on creating an idea.
- Leaving an idea's settings (deleting it), a failed idea, the end of Notes and a bulk move all land on the landing page now.
