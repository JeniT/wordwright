# Docs

One line per doc, worded as when to open it. Open the one that matches your task and nothing else;
[AGENTS.md](../AGENTS.md) has the same routing for the work you do most.

## Working on the code

| When you are…                                                              | Read                                               |
| -------------------------------------------------------------------------- | -------------------------------------------------- |
| Claiming, testing, committing, landing, triaging or running a content crit | [agents/](agents/)                                 |
| Changing anything people see                                               | [design/README.md](design/README.md)               |
| Writing or changing any UI words                                           | [style-guide.md](style-guide.md)                   |
| Running a content crit and wanting a model of one                          | [style-guide-examples.md](style-guide-examples.md) |
| Calling an LLM, or editing a prompt                                        | [responsible-ai.md](responsible-ai.md)             |
| Adding an LLM adapter, boundary evals or invariant tests                   | [evals.md](evals.md)                               |
| Asking why something is the way it is                                      | [adr/README.md](adr/README.md)                     |

## Feature specifications

| When you change…                                                                     | Read                                           |
| ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Sign-in, accounts, publications, sharing, ideas, drafts, deletion or email           | [accounts.md](accounts.md)                     |
| Key storage, model choice, or adding an LLM provider                                 | [byok.md](byok.md)                             |
| Brainstorm (Refine), Research, Critique or Rephrase                                  | [ai-features.md](ai-features.md)               |
| Fetching a user-supplied address, feeding text to an AI, or showing AI output        | [ai-security-review.md](ai-security-review.md) |
| The brainstorm conversation's design in depth (tools, storage, replay, prompt)       | [brainstorming.md](brainstorming.md)           |
| The account settings pages                                                           | [account-settings.md](account-settings.md)     |
| Anything that lets one person's words reach another, or whether under-18s may use it | [online-safety.md](online-safety.md)           |

## Operating

| When you are…                                                                                  | Read                                           |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Deploying, backing up, rolling back, or setting up email or Google sign-in                     | [deploy.md](deploy.md)                         |
| Changing what personal data is stored, kept or sent on, or answering a data-protection request | [data-map.md](data-map.md), [dpia.md](dpia.md) |
| Adding or changing a service that handles personal data, or asked who processes it             | [processors.md](processors.md)                 |
| Personal data may have been lost, leaked or seen by the wrong person                           | [breach-procedure.md](breach-procedure.md)     |
| Something is wrong with the live service; monitoring, secrets, limits or the restore rehearsal | [runbook.md](runbook.md)                       |
| Adding or upgrading a dependency, or asked what we ship and under what licence                 | [dependencies.md](dependencies.md)             |

## Archive (read only when asked)

- [design-concepts/](design-concepts/README.md): the design options we compared before choosing Ember.
- [research/](research/): background research, for example on [idea-source feeds](research/idea-source-feeds.md) and on other LLM providers: [ChatGPT (OpenAI)](research/openai-chatgpt-provider.md), [Gemini](research/gemini-support.md) and [DeepSeek](research/deepseek-support.md).
- `screenshots/`: images used by the docs.

Adding a doc? Add its line here, and start the file with a line saying when to read it.
