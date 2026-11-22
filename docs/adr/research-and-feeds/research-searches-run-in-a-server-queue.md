# Research searches run in a queue on the server (#447)

Replaces the held-open requests of #446, where closing or reloading the tab stopped a search and nothing was kept.

## Decision

**A sent search belongs to the server.** Pressing Research saves a research run at once and puts it in a queue; it runs
to the end whatever the writer's browser does (closing the tab, reloading, signing out, another device). Research only:
Refine already finishes its reply on the server, and Critique and Rephrase are short enough to wait for. Nothing general
("AI jobs") is built.

**A search is a run with a state**, in the existing research table: `waiting`, `searching`, `failed` or `finished`, with
its attempt count and, once failed, a message the writer can act on (never what was sent, never a key). One append-only
migration. So the run list, deleting, and sharing with the publication's members work for a search in progress too, and
it is labelled with who sent it.

**The queue.** Up to `RESEARCH_IN_FLIGHT_MAX` (3) searches run at once per publication; the rest wait, oldest first by
when they were sent. There is no separate cap on how many wait: the hourly throttle bounds it. An in-process worker runs
the queue. The key, the sender's membership and the idea are checked when a search **starts**, not when it is sent. A
deleted idea takes its runs with it, stopping one that is running. After a server restart, searches that were running
run again (the restart counts as an attempt), and waiting ones carry on.

**Charging.** The throttle of 10 searches an hour per person is charged when a search is sent and on each manual Try
again. It is refunded when nothing reached the provider: cancelled while waiting, no key, or the sender has left.
Automatic attempts are not charged (the writer didn't choose them).

**Retries.** Only failures that may clear by themselves retry automatically: a timeout, a provider error, the provider's
rate limit, a restart. Up to 3 attempts, waiting 30 seconds and then 2 minutes (or longer if the provider says so),
without holding a running place meanwhile and keeping the search's place in the queue. A rejected or missing key, or a
sender who has left, fails at once. After the automatic attempts fail, the sender may press **Try again** once, for
another round of up to 3; then the run just shows its error. Anything that can be re-run forever is limited (priority 4).

**Cancel.** The sender can cancel a search while it waits or runs; that stops the provider call and deletes the run (no
"cancelled" state is kept). Other members can't cancel or try again; anyone can delete a run, as before.

**What people see.** The page re-reads the runs every 5 seconds while one of the idea's searches is waiting or
searching and the tab is visible. No email, menu badge or notice elsewhere: nothing nudges people back (priority 4).

- **Research page:** no list under the box. The pager steps through every run whatever its state. Sending jumps to the
  new run; a search finishing elsewhere doesn't move a writer reading another run (#446). A run that isn't done is the
  same article with a state line where its pages go ("Waiting for another search to finish", "Searching the web. This
  can take up to a minute.", "That didn’t work, so trying again (attempt 2 of 3)", or the error), with Cancel, or Try
  again, for its sender. If focus was on a control that goes away when the state changes, it moves to the run's heading.
- **The idea's landing page:** a summary of every run (no limit; there won't be many), newest first: the areas as a
  link to that run's page on the Research page (`?run=<id>`), one state line ("Found 3 pages, 1 added", "Waiting",
  "Searching the web…", "Trying again (attempt 2 of 3)", "Didn’t work: …"), and who asked when the publication has
  other members. No buttons: those live with the results.
- **The hourly limit at send:** the button stays usable; the refusal is an alert under it and the words stay in the
  box. With queueing, the "3 searches are running" refusal goes.

Unchanged: the prompt, what is sent, the search's 180-second time limit, and the rung on the assistance ladder.

## Why

The writer wants to send off questions and get on with their work, on any page or device. Held-open requests tie each
search to a tab, and losing a minute's search to a closed tab or a server blip is the annoyance. Restarting an
interrupted search automatically spends a little of the writer's money without asking; the owner judged that the spend
is small and unremarkable next to the irritation of re-sending it by hand.

## Consequences and alternatives

- **One API process.** The worker, like the throttles and Refine's reply locks, lives in memory; running the API as more
  than one instance needs a shared queue first (a claimed-by column, or a job store).
- **Polling, not a live stream.** Server-sent events would need a held-open connection per page on one process; five
  seconds is quick enough for a search that takes about a minute.
- **Rejected:** a separate jobs table (a run with a state is the job, and members see it for free); a list of searches
  under the box on the Research page (one pager over every run instead); per-person "seen" tracking for finished
  searches on the landing page (the landing page lists every run instead); a notification when a search finishes.
- `lib/research-searches.ts`, #446's per-tab memory, goes: the server's runs replace it.
