# e2e runs by what a change touches; CI runs the whole suite (#461)

## Decision

A change runs locally only the e2e tests it could break: none for logic, API, copy or a change inside one component;
the screen's spec for a flow, layout or style change on one screen; the whole suite once, before landing, for a change
to the app's shell (the list is in [testing.md](../../agents/testing.md#when-to-run-e2e)). Landing after an overlapping
rebase reruns those specs, not the whole suite. CI runs the whole suite on every push to `main` and is the gate for
everything else.

## Why

The definition of done asked for the whole suite on every change, and landing asked for it again after an overlapping
rebase. The suite is 134 tests and took 4.5 minutes on a quiet machine (November 2026), much longer beside other
sessions' runs, so a one-line fix cost more in e2e than in work. Most changes reach one screen, and that screen's spec
covers them; the rest are caught by CI on `main`, and the next session checks CI before it starts and fixes a red
first ([claim.md](../../agents/claim.md)). This extends
[Landing: CI on `main` is the final gate](landing-ci-on-main-is-the-final-gate-not.md) from rebases to every change.
Sumwright already works this way.

## Consequences and alternatives

Accepted: more red runs on `main`, when a change breaks a screen it was not thought to reach. The session that pushed
it fixes it before anything else. If that becomes frequent, the shell list grows, or a script picks specs from the
changed files.

Rejected for now: making the suite faster instead (it is worth doing too, but does not remove the reruns), and running
e2e only in CI (a new flow's own spec is cheap and is how its author knows it works).
