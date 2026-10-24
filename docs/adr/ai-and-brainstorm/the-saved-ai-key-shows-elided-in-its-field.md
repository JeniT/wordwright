# The saved AI key shows elided in its field

The key field shows the saved key as the placeholder, cut where Anthropic's console cuts it (`sk-ant-api03-AbC...1234`),
rather than a blank field and a separate "Key saved" line. The elided form is worked out from the encrypted key when
settings are read (`elide` in `services/llm.ts`), so nothing new is stored. What is shown is the constant prefix plus
three characters of a key that is over a hundred long, so it can't be used to guess it, and the key itself is still never
sent back.
