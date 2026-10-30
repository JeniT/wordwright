# A list of account deletions outside the database repeats them after a restore (#410)

A rollback or restore puts back an older database, and with it people who deleted their account since that backup was taken. Their data would be back without their asking. Backups cannot be edited, and the live database is the thing being replaced, so the list of who to delete again has to live somewhere a restore does not touch.

- **A file beside the database in the data volume** (`deletions.jsonl`, `DELETION_JOURNAL_PATH`). `rollback.sh` moves only the database files, so the list survives. One JSON line per deletion: the time, the account's random id and whether the display name was kept. **No name, email or address**, so the list is not itself personal data about a person, and it is not a reason to keep anything.
- **Written after the deletion commits**, never inside the transaction: an entry for a deletion that was rolled back would delete a live account on replay. The cost is that a crash between the commit and the write loses one entry; that is a small, accepted gap.
- **Replay is a command, not automatic**: `replay-deletions-cli.ts <time the backup was taken>` lists what it would do, and `--apply` does it, through the same `removeUserAndOwnedData` as an ordinary deletion. `rollback.sh` prints the command with the time from the backup's file name. Safe to repeat; ids not in the database are skipped. The "last owner of a shared publication" refusal is not repeated: it was settled at the time.
- **Trimmed to 45 days**, longer than the longest a backup lives (30 days off-site, plus 7 for an old version), so the list never outlives the backups it protects against.
- **Copied with the backups.** `backup.sh` copies it into `~/backups`, and the off-site upload includes it (encrypted like the databases), so after losing the server the newest copy says whom to delete again.
- **Rejected:** a table in the database (rolled back with it); a "deleted users" tombstone with an email hash (personal data kept for no reason); deleting automatically on start-up (a wrong time would delete people who did not ask); editing backups (breaks the integrity check and the encryption).

The runbook is in [deploy.md](../../deploy.md#after-a-rollback-or-restore-repeat-the-deletions).
