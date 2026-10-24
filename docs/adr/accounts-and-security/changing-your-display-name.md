# Changing your display name

The name asked for at sign-up ("What should we call you?") is what other people see: on notes and brainstorm
messages, in a publication's list of people, and in invitations. It can be changed on the Account page
(`PUT /api/account/name`, validated by the same `NameSchema` as sign-up and publication names: trimmed, 1 to 100
characters). **Nothing keeps a copy**, so a change shows everywhere at once with no migration: note authors, thread
messages, members and a waiting invitation's sender are all read from `users.name` when shown, and tests prove it
for each. The old name is not kept anywhere on purpose. There are two copies that cannot follow a change: emails
already sent (they say the old name, and the form says so), and the in-memory "X is waiting for a reply" lock during
a brainstorm reply in flight, which lasts at most the reply timeout. Unlike a username it has no effect on any
address, so there is no list of retired names and no daily cap, only the light per-person throttle other account
changes share. Names are not unique, as before.
