# Where you're signed in: a label and a time, nothing else (#165)

After losing a laptop or using a shared computer, a writer can see their sessions and end them. **What is stored per session** is a
public `id` (random, so the page can name a session without the cookie or its hash ever leaving the server), a **coarse device
label** and `last_used_at`; nothing else was added. **No IP address, no location, no raw User-Agent.** Those would be personal data
kept for a screen that only has to say "is this me?", and a location from an IP is often wrong enough to alarm. The label comes from
`auth/device.ts`: a few ordered regexes over fixed words ("Edge", "Safari", "macOS"...), run over only the first 512 characters, so
the client-controlled header can't make it slow and **nothing it sends is ever stored or shown back** (a hostile header can't plant
text on the page; the worst it gets is "Unknown device"). Sessions from before this change are "Unknown device" and can still be ended.
`last_used_at` moves on at most once an hour, so reading a page doesn't write. **Throttling:** none of the new routes can be used to
guess a secret or costs money (ids are 122-bit random; ending a session needs an existing one), so they get none beyond sign-in; a
stranger's id is 404 like a missing one. **Rules kept:** password change ends every other session, a password _reset_ ends all of them
(it proves only the inbox, not the device), an email change ends none (it already needs the password and emails the old address).
The current session can't be ended from the list (it would sign the person out of the page they are looking at): that is "Sign out".
"Sign out everywhere else" asks first, because it is a bulk removal, and says how many it ended. Reviewer-only accounts have no account
page and so no list.
