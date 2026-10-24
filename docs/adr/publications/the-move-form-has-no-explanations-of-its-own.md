# The Move form has no explanations of its own (#277)

The Move form (`MoveFields`) says how many it moves in its label (“Move 4 notes to”; the one-row dialog, whose title
names the note or item, keeps “Move to”) and nothing else about what moving keeps: no “moved, not copied”, no “keeps its
tags”, no note about a new idea's name. The result shows in the destination and in the notice that follows (with Undo).
The only line left is that the pages the notes were taken from are copied to the destination's articles, since that
is a side effect the writer wouldn't guess; it is body text, not small print. The select is no longer wrapped in a second
flex container, which is what let a long idea name push it past the edge of the dialog.
