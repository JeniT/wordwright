# The saved AI key shows elided in its field

The key field used to be blank with "leave blank to keep the current one" and a separate "Key saved (…1234)" line. It now
shows the saved key as the placeholder, cut where Anthropic's console cuts it: after the third character that follows the
third hyphen, then the last four (`sk-ant-api03-AbC...1234`). The hint says "Leave as is to keep the current one"; with no
key the placeholder is `sk-ant-...`, on the first-run form too. The placeholder goes when something is typed. The elided
form is worked out from the encrypted key when settings are read (`elide` in `services/llm.ts`), so keys saved before this
show it too, and nothing new is stored; if a key can't be decrypted, or has too few hyphens to cut that way, only the last
four are shown. What is shown is the constant prefix plus three characters of a key that is over a hundred long, so it
can't be used to guess it, and the key itself is still never sent back.
