# Decisions: accounts and security

Read this when you change sessions, passwords, email, linking, deleting an account, where you are signed in. One file per decision; the title says what was decided. Open the ones that touch your change.

- [Sessions: opaque cookie, hashed in the database](sessions-opaque-cookie-hashed-in-the-database.md)
- [Passwords: scrypt from `node:crypto`](passwords-scrypt-from-nodecrypto.md)
- [Account linking and unverified emails](account-linking-and-unverified-emails.md)
- [Account deletion semantics](account-deletion-semantics.md)
- [Email: provider-neutral SMTP; sent after responding; zero-setup default](email-provider-neutral-smtp-sent-after-responding-zero-setup-default.md)
- [Email confirmation: gate sharing, not writing](email-confirmation-gate-sharing-not-writing.md)
- [Changing and adding passwords while signed in](changing-and-adding-passwords-while-signed-in.md)
- [Changing the email address: prove the new inbox, check the password, retire the old address's links](changing-the-email-address-prove-the-new-inbox-check.md)
- [Abandoned unconfirmed accounts are deleted after 14 days of no use](abandoned-unconfirmed-accounts-are-deleted-after-14-days-of.md)
- [Changing your display name](changing-your-display-name.md)
- [Where you're signed in: a label and a time, nothing else (#165)](where-youre-signed-in-a-label-and-a-time.md)
