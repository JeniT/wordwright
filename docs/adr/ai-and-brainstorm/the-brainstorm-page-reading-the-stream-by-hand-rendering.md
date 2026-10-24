# The brainstorm page: reading the stream by hand, rendering safely, consenting by clicking

The reply is a `fetch` POST read with a small stream reader (`lib/sse.ts`), not `EventSource`, which can only GET and
can't be cancelled like a request; **Stop** aborts the request and also cancels a read that is waiting, so it works
whatever the browser does, and what was said is kept. The page keeps the saved thread as the truth: while a reply
streams it shows a live copy, and only after re-reading the thread does it drop that copy, so nothing flickers or
doubles. Every piece of the AI's text is untrusted: Markdown goes through `markdown-it` with HTML off, images shown as
their alt text only (an image address can leak data), only web, mail and in-page links kept and opened in a new tab
without `opener`; the one `v-html` in the app is in `Markdown.vue`, behind that. (`markdown-it` and its types are the
only new dependencies: hand-rolling Markdown rendering is a worse risk.) Suggestions are shown against the idea as it
is now, as a line diff (`lib/diff.ts`, no dependency), with "added"/"removed" in words as well as colour, and a
suggestion made against older text is labelled and offered as **Apply anyway**. The idea page's Brainstorm link adds
`?start=1` only once it knows there is no conversation, and the page begins at once and drops the parameter, so
visiting or reloading never spends the person's money by itself; a direct visit shows a **Start brainstorming**
button instead. A message that couldn't begin (no key, throttled, someone else replying) goes back into the box.
Found by the axe checks: `role="log"` isn't allowed on a list (it wraps one), and suggestion cards are `h2` under the
page's `h1`.
