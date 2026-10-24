# Every draft belongs to an idea

An idea is a name, notes, articles and its drafts. Drafts first gained a nullable `idea_id` and the
ones that already existed stayed standalone (T20); T20c then finished the job: a migration wraps each leftover
draft in an idea of its own, named after the draft (or "Untitled idea") and dated like it, so nothing is lost and
people can regroup them later. Drafts can only be created through an idea (`POST /ideas/:id/drafts`); the
standalone create and list routes are gone, and the publication page lists ideas. `drafts.idea_id` is still nullable
in the schema because SQLite can't add NOT NULL afterwards; the store always sets it and the API schema requires
it. An idea's drafts are listed with it in an order the person sets, which is also the reading order for a linked
set of posts (T20e). New drafts go last; `drafts.position` holds the order and `PUT .../ideas/:id/drafts/order`
changes it the same way as idea sources (the complete list of ids, refused with a 409 unless it names exactly the
idea's drafts), and counts as a change to the idea. Deleting an idea deletes its drafts, which the page says before it asks for confirmation.
Links are plain web addresses (http/https only, with `https://` assumed when someone types `example.org`); the
field is a text input, because `type="url"` makes the browser refuse that. Having an idea counts as "using" an
account, so the unconfirmed-account cleanup never deletes someone's ideas. Renaming a publication rewrites its id in
every table that points at it; `ideas` was missing from that list at first, which broke renaming any publication
that had one, so the rename test now creates an idea.
