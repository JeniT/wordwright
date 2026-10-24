# A note's origin line, and who it is credited to (T42, #62, #63, #274, #306, #309, #313)

A note says where it came from and who recorded it, in a shared space where "added by hand" would not say whose hand.

**The line.** What it is, then a link where there is somewhere to go: "Added"; "From conversation with your AI" (or "their
AI" when the viewer is not its author, the author has left, or nobody is signed in), linking to the idea's Refine page (the
note does not record which of the idea's conversations it came from, and a note kept on the publication has no idea, so
there it is plain text); "From" and the article's title, linking to the page, which opens in a new tab ("From reading"
with nothing to link to once the article is removed). A quotation is shown by its quote mark; the article's authors are on
the article's own page, so the line does not repeat them. "By" is kept for the author of a piece, never for the person who
took the note: "Quoted while reading “Title”, by Jeni" read as if Jeni had written the piece.

**The person** is a **name chip** on its own line underneath, for every origin, so the line reads the same whether or not
it has a link and a long page title does not push the name around. The chip is a rounded pill like a tag but blue, so it
can't be mistaken for one; screen readers hear ", recorded by Ada". It is used on the idea's Notes, the article's page,
the notes beside the draft and the draft's record of where words came from.

- **Where a chip is used (#313).** It is an attribution label: who recorded a note, who wrote a comment or a Refine message,
  who edits a draft. A name inside a sentence stays text ("asked by Ada", handover notices, "added by Ada" on a
  suggestion). Your own name is a chip like anyone's; comments do not say "You". "A former member" is the one wording for a
  missing name in a chip and in the offer callout, which cannot make sense without a name. A sentence whose meaning survives
  without the name says nothing instead.
- **Kept names (#313).** Every place that shows a person's name follows "Names stay if the person chooses" (see
  [Account deletion semantics](../accounts-and-security/account-deletion-semantics.md)). The name is read from the user
  row, so it is always current; once the account is gone it is the kept name if they chose to keep it, else "A former
  member". A review's "asked by" and a suggestion's "added by" store a kept name for the same reason.
- **Who is credited for an AI note (#306).** A member can open a conversation another member had with their AI and add or
  edit its suggestions, so a suggestion is credited to **the person whose message prompted the reply it came in** (for the
  opening reply: whoever began the conversation), and **whoever last edits it while it waits** replaces them. The person
  who presses "Add to notes" is not the author. Stored as `author_id` and `edited` on the suggestion; `edited` also takes it
  out of the highlighter, which marks only the AI's words. Suggestions made before this keep the old rule (whoever adds
  them). Editing a note already on the Notes page does not change its author.

**Authors of an article (#63).** An article has `authors` (up to 10 names), found with the title from the page's metadata
(`author`, `article:author` when it holds a name, `dc.creator`, `citation_author`, then JSON-LD; the first source that names
anyone wins) and correctable by the writer, who always wins: a lookup never overwrites names they entered. They are typed
separated by commas, so "Last, First" would be split in two; that is the cost of one plain field. The draft's record of where
words came from keeps the authors as they were when the words went in, like the title.
