# Personal data breach procedure

Read this the moment you suspect that personal data has been lost, stolen, sent to the wrong person or seen by someone who should not have seen it, and when you review how the service responds to incidents. The data is described in [data-map.md](data-map.md); server commands are in [deploy.md](deploy.md). For an outage with no data exposed, see #322.

A breach is not only an attack. Examples: a stolen laptop or SSH key; a leaked `.env`, `KEY_ENCRYPTION_SECRET` or backup password; a bug that shows one person another's writing; an email sent to the wrong address; a lost or exposed backup; a processor telling us they were breached.

**The clock:** if it is likely to risk people's rights and freedoms, report it to the ICO **within 72 hours of becoming aware** of it. Awareness starts when you have reasonable certainty that personal data was affected, not when it started. Do not wait for the full picture; a report can be made in stages.

## 1. Contain (first hour)

- Stop the harm before understanding it. Cut off whoever has access: `docker compose stop api` (sign everyone out of a live bug), revoke the leaked token or key, remove a compromised SSH key, rotate the exposed secret.
- Rotating `SESSION_SECRET` signs everyone out. Rotating `KEY_ENCRYPTION_SECRET` makes every saved AI key unreadable (there is no rotation tool yet, #169): do it only if the secret itself leaked, and tell writers to re-enter their keys.
- If AI keys may have leaked, writers must revoke them in their provider's console; the app cannot.
- **Preserve evidence.** Note the time, who found it, and what you saw. Copy the logs (`docker compose logs api > ~/incident-<date>.log`) before they rotate (50 MB cap). Do not "tidy up".

## 2. Assess (within the day)

Write down, in `~/incident-<date>.md` or the log below:

1. What happened, and when it started and ended.
2. Which data (use the data map's tables): account details, passwords (hashes), AI keys (encrypted), writing, comments?
3. Whose, and roughly how many: writers, reviewers, people invited, people named in writing.
4. Could it be read: was it encrypted, hashed or in plain text? (Passwords are scrypt-hashed; tokens are hashed; AI keys and off-site backups are encrypted; the live database, local backups, writing and emails are not encrypted at rest.)
5. The risk to people: low (an email address to the wrong person), or likely harm (unpublished writing, credentials, an AI key that spends money).

## 3. Decide who must be told

| Risk                                                                                 | ICO (72 hours) | The people affected                                                                                     |
| ------------------------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------- |
| **Unlikely** to risk anyone's rights (for example, encrypted data with the key safe) | No; record it. | No.                                                                                                     |
| **Likely** to risk rights (writing, emails or names exposed; hashes taken)           | **Yes**        | If high risk (readable writing, keys, anything that could harm them) tell them **without undue delay**. |

When unsure, report. The ICO's own self-assessment tool and helpline (0303 123 1113) help with the decision. The owner decides; a lawyer can help.

- **Report** at ico.org.uk ("Report a breach"). Have ready: what happened, categories and approximate numbers, likely effects, what has been done, a contact.
- **Tell people** by email from `hello@wordwright.io`, in plain words: what happened, what data, what it may mean for them, what we have done, what they should do (change password, revoke the AI key), and how to contact us. Follow [the style guide](style-guide.md). Do not blame or soften.
- **If a processor** (UpCloud, Scaleway, Gandi) tells us of a breach, the clock starts when they tell us. If we cause it for them (for example a leaked API key), tell them.
- If other people's writing was involved, consider that the writers may have their own duties to the people they wrote about; say so in the message.

## 4. Fix and learn

- Close the cause, then bring the service back and check it (`/ready`, a test sign-in).
- Write the cause and the change in the log; file issues for the follow-ups; add a test where code allowed it.
- Review whether the data map, DPIA or this procedure should change.

## The breach log

Every breach and near miss goes here, whether or not it is reported (Article 33(5)). Add a row when it is closed. Keep no personal data in the log.

| Date | What happened | Data and numbers | Risk | Reported to ICO? | People told? | Cause and fix | Issue |
| ---- | ------------- | ---------------- | ---- | ---------------- | ------------ | ------------- | ----- |
| —    | None yet      |                  |      |                  |              |               |       |

## Practise it

Run this once before the public launch as part of the restore rehearsal (#322): pretend `.env` leaked, walk steps 1 to 3 on paper, and time how long each takes.
