# Triage: turning the owner's ideas, features and bugs into tasks

Read this when the owner asks you to triage (a specific issue, or "what's in the inbox?"), or when you file an issue.

The owner drops raw thoughts into the issue list as they come, without having to shape them. An agent then talks
each one through with them and produces the real task and decision issues.

## Labels

| Role in the skills | Label here | Meaning                                           |
| ------------------ | ---------- | ------------------------------------------------- |
| `needs-triage`     | `inbox`    | Not yet triaged; the owner needs to evaluate this |
| `needs-info`       | `question` | Waiting on the reporter for more information      |
| `ready-for-agent`  | `ready`    | Fully specified; an agent can start now           |
| `ready-for-human`  | `decision` | Requires the owner's decision or action           |
| `wontfix`          | `wontfix`  | Will not be actioned                              |

Also in use: `backlog` (waits on a prerequisite or decision), `in-progress` (claimed), `idea`, `duplicate`, and the
type labels `enhancement`, `bug`, `documentation`, `content-crit`.

## Filing (the owner, or an agent on their behalf)

Open an issue with the label `inbox` plus one type label: `idea` (a rough thought), `enhancement` (a feature) or
`bug`. A title and a sentence or two is enough; for a bug, what happened and what was expected. `inbox` means "not
yet triaged": `gh issue list --label inbox` is the queue, and an `inbox` issue is implemented only after triage.

## The triage conversation

1. Read the issue, plus what already exists: the decisions in [docs/adr/](../adr/README.md), open issues
   (`gh issue list --state all --search "<keywords>"`) and the code it touches. Say so if it duplicates or overlaps
   something; link the existing issue instead of filing a second copy.
2. **Talk it through with the owner before filing anything.** Ask a few questions at a time, only ones whose answers
   change the outcome. Offer a recommendation and the options you'd drop, rather than a survey. For a bug, try to
   reproduce it first and say what you found. For an idea or feature, test it against the four priorities in
   [AGENTS.md](../../AGENTS.md) and name the cost (scope, new dependency, spending, migration). If it calls an LLM,
   also state its rung on the assistance ladder, what the writer does first, what text leaves the system, what is
   capped, and which boundary evals it needs (see [responsible-ai.md](../responsible-ai.md), [evals.md](../evals.md)); without those it is
   not `ready`.
3. Agree the outcome with the owner, which is one or more of:
   - **Task issues** for work that is clear: a "why", then acceptance criteria that include the tests and docs the
     [definition of done](definition-of-done.md) requires, small enough for one agent in one go. Label `ready`, or
     `backlog` if it waits on a prerequisite (name it: `Needs #12`). Add `bug` or `enhancement` too. A big feature
     becomes an ordered set of tasks, each its own issue, plus a design note in `docs/` if the reasoning needs a home.
   - **Decision issues** (label `decision`) for what the owner must choose: the question, the options with
     trade-offs, your recommendation, and which tasks it blocks.
   - **Every task and decision issue gets a milestone**: `Alpha features` (a 1.0 working locally, not deployed),
     `Go live` (a production version others can use), `Beta features` (features we know we want, which can wait until
     others are trying the app) or `Ideal world` (things we might want some day, not sure they are necessary)
     (`gh api repos/JeniT/wordwright/milestones -q '.[].title'` lists them; pass `--milestone "<title>"` to
     `gh issue create`, or `gh issue edit <n> --milestone "<title>"`). Agree it with the owner in the triage
     conversation, with your recommendation. A raw `inbox` issue needs none until it is triaged.
   - **Nothing**: "won't do" or "already covered", with the reason. Label `wontfix` or `duplicate`.
4. File them, then tidy the original: comment with links to everything it produced (`Triaged into #31, #32;
decision #33`), remove `inbox`, and close it. If the owner wants to keep it as the umbrella for several tasks,
   leave it open without `inbox` and list the tasks in a comment.
5. A confirmed `bug` that breaks something people already rely on (data loss, security, sign-in, a red `main`) is
   `ready` straight away and mentioned to the owner as urgent; other bugs queue like any task.

Triage produces issues, not code. If the owner then says "go ahead", claim the task ([claim.md](claim.md)).
