# Off-site backups: Scaleway Object Storage, encrypted before upload (#17)

- **Where:** a private bucket in a Scaleway project of its own, so the key on the server reaches only the backups. Scaleway is
  a different provider (and company) from the host, so losing the UpCloud account does not lose them; it is EU-based and
  the owner already had an account. Rejected: fetching to the owner's computer on a schedule (it has to be switched on),
  and UpCloud's own object storage (the same account).
- **Encrypted on the server first** with rclone's crypt (file names too), because the backups hold writers' unpublished
  work. The cost is one more secret, the encryption password and salt, which the owner keeps in a password manager; without
  them the off-site copies cannot be opened. Server-side encryption alone would leave Scaleway able to read them.
- **rclone, from a pinned container image**, not a new package on the server and not hand-written S3 signing and encryption
  in our code. Nothing is installed on the host; the version changes only when someone edits the pin in `deploy/offsite.sh`.
- **The key may delete in its bucket** (the policy is full access to that one project), so a compromised server could delete
  backups; **versioning** on the bucket makes a deletion recoverable for a week. A write-only policy would be tighter, and
  was left for later because the permission sets are easy to get wrong without a way to test them from here.
- **Retention is the bucket's job** (30 days, non-current versions 7), not ours: uploads use `copy`, which never deletes. A
  deleted account's data can stay in backups for up to about 37 days; the data map (#320) says so.
- **A failed upload fails the nightly run** (but keeps the local backup), so it shows in `systemctl`. Bucket creation is
  turned off in rclone, so a mistyped name is an error, not a stray bucket.
