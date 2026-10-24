# Passwords: scrypt from `node:crypto`

No native dependency. Format `scrypt$N$r$p$salt$hash` lets cost be raised later without invalidating old hashes.

**Length rule (#207):** at least 8 characters and at most 128 (the maximum bounds hashing cost), with no composition
rules (no required digits, symbols or case). One rule, shown on the page, shared by registration, reset and change via
`PasswordSchema`. Passwords set under the old 10-character minimum keep working. Any further check (a breached-password
list, say) needs a decision first.
