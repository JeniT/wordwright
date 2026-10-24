# Holding to confirm instead of a dialog (T39)

Deleting a note asks for a deliberate act without a dialog: **press and hold** the Delete button (about 0.9 s,
`HOLD_MS` in `HoldButton.vue`) while a ring fills around the pointer. Letting go early, moving off the button or
tabbing away cancels; finishing the hold deletes.

- **Every way in.** The mouse and a finger (the ring is drawn above a finger, which would hide it; the context
  menu and text selection are blocked on the button so a long press doesn't open them) and the keyboard (hold Enter
  or Space; the key's own click is suppressed so a quick press does nothing).
- **Assistive technology can't hold.** A click that no press or key led to (a screen reader's "activate") arms the
  button instead ("Press again to confirm", for 5 s); a second one confirms. The button's description tells
  people both ways, and a polite live region announces holding, confirming and cancelling.
- **Reduced motion.** With `prefers-reduced-motion` there is no ring; the label says "Keep holding…". The ring
  itself is a CSS animation of the hold's length, while the confirmation is decided by a timer, not by the
  animation, so they can't disagree.
- **Where.** Only deleting notes so far. Related-work links and other deletions are unchanged; anything that
  deletes work that can't be got back can adopt it (`<HoldButton @confirm=…>`), and the delete-an-idea and
  start-again dialogs stay as they are for now.
