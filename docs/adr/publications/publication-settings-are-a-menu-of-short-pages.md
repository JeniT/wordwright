# Publication settings are a menu of short pages (#240)

Publication settings were one long page, with a second page (`/describe`) for the description. They now follow the account
([account-settings.md](../../account-settings.md)): a `publication-settings` menu level whose pages are plain links, no numbers
(**Details**, **Description**, **Sharing**, **Download**, **Delete publication**), the way up being "← {publication}".
`/p/:id/settings` redirects to Details, so the gear and old links still work.

- **Delete is owners only.** A member's menu leaves it out and its address sends them to Details, instead of showing a
  locked page. Everything else is open to members as before (Details read-only; the description editable by everyone).
- **One component for the name and website** (`PublicationDetailsFields`), shared with New publication, so the two forms
  can't drift apart. Wording follows the creation form: "Website (optional)", hint "Where it gets published." (the example
  address was dropped from both), the "About the website" info icon, and in settings an info icon on the name saying that
  renaming changes the address. The picture stays its own section: creation sends it with the form, settings saves at once.
- **Then:** the Description page absorbed `/describe` (#241) and Feeds became a page (#242).
- Download repeats the account page's text for one publication, minus keys (keys belong to accounts, not publications).
