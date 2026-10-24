# Square site and feed icons fill the image box (#225, #226)

#177 drew every site icon contained on a light plate, never cropped. That is right for rounded or irregular icons, but a
square one then looks small in its box. An icon now fills the box when it is **square to its corners**: as wide as it is
tall, at least 64px a side (smaller would be blurry stretched), and all four corners, sampled just inside the edge (2px in, or 1% of the side),
with alpha of 250 or more (a little under full tolerates anti-aliasing). The frame stays; everything else stays on the plate. Wrong answers are safe
ones (the plate), so anything unreadable counts as not square.

It is checked **on the server when the icon is fetched** (`services/icon-shape.ts`) and stored as a flag next to the icon,
so publication site icons and feed icons behave the same and the browser does no pixel work. PNG, JPEG, WebP and GIF
(first frame of an animation) are decoded with **`sharp`**, a new dependency chosen because it ships prebuilt binaries
and reads every raster format we accept. It cannot read `.ico`, so a small reader of our own takes the largest square
entry: an embedded PNG goes to `sharp`; a bitmap is read directly (its own alpha at 32 bits, else its transparency
mask). A JPEG has no transparency, so it is square when its sides match.

Icons stored before the flag have it null and are shown on the plate; `backfillIconShapes` records it in the background
at startup, and is a no-op once done. Rejected: checking in the browser with a canvas (work on every display, and not
shared with the feed icons) and a library for ICO (one more dependency for a short parser).
