# Who took a note is a chip, not "by Name" (#62)

"Quoted while reading “Title”, by Jeni" read as if Jeni had written the piece. A note's origin line is now what it is
("Added", "From conversation with your AI" (or "their AI"), "From reading “Title”", "Quoted from “Title”") followed by the person who recorded it as
a **name chip**: a rounded pill like a tag but blue, so it can't be mistaken for one, with a neutral "A former member"
chip once their account is gone. Screen readers hear ", recorded by Ada". The same component is used on the idea's
Notes, the reading page, the notes beside the draft and the draft's record of where words came from. "By" is kept for
the author of a piece (#63). Users have no pictures yet (only publications do), so the chip is their name; a picture can go
inside it when accounts get one.

**Where a chip is used, and where it isn't (#313).** The chip is an attribution label: who recorded a note, who wrote a
comment or a Refine message, who edits a draft. A name inside a sentence stays text: "asked by Ada", the offered/waiting
callouts and handover notices (bold prose), "added by Ada" on a suggestion. Your own name is a chip like anyone's: comments
no longer say "You", because the rule everywhere is the person's name. "A former member" is the one wording for a
missing name in a chip and in the offer callout, which cannot make sense without a name; "Someone" is gone. A sentence
whose meaning survives without the name ("asked by Ada") says nothing instead of "asked by a former member".

**Kept names, audited (#313).** Every place that shows a person's name was checked against "Names stay if the person
chooses". Two sentences lost a kept name: a review's "asked by" (`draft_reviews.kept_inviter_name`) and a suggestion's
"added by" (`idea_proposals.kept_decided_by_name`); both now follow the same rule as the rest. Not gaps: a draft's editor
(drafts are handed to an owner before an account goes, so the editor is never missing; the "A former member" in
`ideas.ts` is only a guard), handover offers (they go with the sender) and review invitations (they cascade).
