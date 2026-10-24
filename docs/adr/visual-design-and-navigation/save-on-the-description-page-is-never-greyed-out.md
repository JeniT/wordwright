# Save on the Description page is never greyed out without a reason (#239)

Clearing the description and the page's heading (`StepHeading`, like its siblings) were settled by #241. What was left was
a Save button that was disabled when nothing had changed, with no explanation. It is now disabled only while saving and when
the text is over the limit (the editor says how far over, beside the box). Saving an unchanged description is harmless,
so there is no "nothing to save" state to explain.
