# Abandoned unconfirmed accounts are deleted after 14 days of no use

A typo'd or abandoned signup otherwise squats on an address forever (the real owner then can't register).
"Unused" means no drafts, no saved API key and no other people in their publications, so nobody who has started
using the product loses work; the 14 days is configurable and 0 disables it. It runs as a simple in-process
interval (every 6 hours, 10 s after start, never overlapping, errors logged and retried), not a job queue,
because it's idempotent and cheap, and running on several instances at once is harmless. Deletion uses the same
code as "delete my account" (`removeUserAndOwnedData`) so the two can't drift. The signup email states the rule
up front, and (T3e) a single reminder goes out 3 days before deletion (or half the limit, if that is shorter),
so a late confirmer isn't surprised. It carries a fresh confirmation link, which is the one-click way to keep the
account. `users.deletion_reminded_at` records that it was sent; it is set before the mail is queued, so a delivery
failure (logged, like all background mail) means no reminder rather than a duplicate. Only accounts inside the
warning window are warned, so on first deploy, or after downtime, accounts already past the limit are deleted
without a warning, and the job deletes before it warns.
