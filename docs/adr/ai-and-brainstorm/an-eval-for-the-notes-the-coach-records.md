# An eval for the notes the coach records (#184)

`notes-reuse-the-writers-words` gives the coach a message with three separate points (none already in the notes) and checks the
`add_note` calls it makes: two to six of them (a note per point as it is made, not none and not a flood), each of thirty words or
fewer, each mostly the writer's own vocabulary (at least 60% of its words of four letters or more appear in the message, so a
tidier paraphrase fails), and a rubric that none is the coach's own view or a point the writer did not make. "Mostly their phrases"
is measured by words, not by a shared run of words, because a faithful note often rearranges them ("parents with children" for
"parents who bring their children"). No prompt changed. It has not been run on a real model: until it has, treat the 60% and the
count as guesses to tune.
