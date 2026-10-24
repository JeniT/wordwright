# Changing the email address: prove the new inbox, check the password, retire the old address's links

The change is a request plus a link to the _new_ address; the account keeps its old address until the link is
opened, so a typo is harmless. The password is re-checked when asking (a stolen session shouldn't be able to
redirect the account's email), the pending address is stored with the token so a link can only ever switch to the
address it was sent to, and only the newest request works. A password change or reset cancels a pending request:
otherwise a thief who started one could still finish it after the owner took the account back. On success the
new address counts as verified, and everything that was addressed to the old one is dropped: confirmation and
reset links, and invitations other people sent to it (invitations are matched on address, so they'd be
unusable anyway). The old address gets a notice with a "this wasn't me" link (7 days; the owner can recover the account even if the password is known to someone else). The link opens a page with a button rather than acting on load, because it signs everyone out and a mail scanner opening links must not trigger it; it works only while the account still has the address the change moved it to, restores the old address as verified (they opened mail there), signs out all devices and emails a reset link, since the intruder knew the password. Accounts with no password
(Google-only) can't change it yet: with only a session as proof there is nothing to stop a hijacked session
redirecting the email, so they add a password first (which already needs an emailed link). "Address already in
use" is revealed, as at registration, because the person has to be told; it is behind sign-in and throttled.
