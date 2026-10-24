# Email confirmation: gate sharing, not writing

Unconfirmed accounts can write and use AI features (nothing is exposed to anyone else), but can't invite others:
sharing is the one place an unproven address could leak someone's work. Links are bound to the address they
were sent to, hashed at rest, expire after 24 hours, and only the newest works. Using a link twice succeeds, because
mail scanners and double clicks routinely open links first. Resend is limited to 3/hour per user. Chosen over
blocking sign-in until confirmed because that makes a typo'd address a dead end and turns every mail outage into
a lockout.
