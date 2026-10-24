# Publications: one word, and ids `<handle>-<slug>` (#174)

A publication is where a writer publishes (a Substack, a blog, a magazine, a newsletter). It started as a container with
members and drafts called a "profile", and was also called a "venue" in places; neither says what it is, so #174 settled on
**publication** everywhere (code, database, API, prompts, screens and docs; the OAuth `profile` scope is the identity
provider's word and is unchanged). The container _is_ the publishing place, so it was extended rather than adding a second
concept. Publication URLs get shared, so ids are readable: users get a
`handle`, and a publication's id is `<creator's handle>-<slug of name>`. **Handles contain no `-`**, which makes the
split unambiguous: otherwise handle `jen` + publication `it-substack` and handle `jenit` + publication `substack` would
both be `jenit-substack`. The id follows the name: renaming a publication gives it a new id, and the old id stays in
`publication_aliases` forever. The API answers the old id with a 301 (308 for writes, which keeps the method and body)
to the new one, but only for members, so a stranger gets the same 404 as for an unknown id and can't learn that a
publication was renamed. Retired ids are never reused for another publication (a new "Blog" gets `-2`), but renaming back to
an earlier name reclaims its id. The web app moves the address bar when it meets an id that isn't in the person's
list (`usePublicationAddressRedirect`). The id belongs to the creator's handle even if ownership later moves (T11). Handles are chosen at sign-up (checked live for availability); only sign-ups through an identity provider
get a generated one, and are asked once whether to keep it (`users.handle_chosen`). They can be changed later. Alternatives rejected: per-user
uniqueness on the name alone (URLs would need the user in the path anyway), and globally unique names (squatting,
and the `substack` clash the owner wanted to avoid).

**Why the schema was reset (#174).** There were no live deployments, so renaming tables through appended migrations would have
kept a history nobody needs (sixty steps, a handle backfill, data-rewriting migrations, table rebuilds). `MIGRATIONS` became
one entry, the whole schema, and later changes append as before. The vestigial `ideas.notes` column and the nullable
`drafts.idea_id` went with it; `users.handle` stays nullable because reviewer-only accounts have none. A development database
from before the reset has a higher schema version than the build knows and is refused: delete it (the default file is now
`apps/api/data/wordwright.sqlite`, not `lfwa.sqlite`). The wording of the AI's context changed from "venue" to "publication",
which is a prompt change for the owner to review.
