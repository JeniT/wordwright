/**
 * How long a hold-to-confirm button must be held. One place to tune it, so every button in the app (and the end-to-end
 * tests that hold them) agrees. It is a function so a person's own preference could replace it later.
 */
export const HOLD_MS = 1500

export const holdDuration = () => HOLD_MS
