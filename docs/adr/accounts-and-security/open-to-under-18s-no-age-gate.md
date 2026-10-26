# Open to under-18s: no age gate, and no 18+ statement

## Decision

Wordwright does not limit sign-up to people aged 18 and over, and does not state an age limit beside Create account or in the terms. Beside Create account we say that the AI features need the writer's own key from a provider, and that providers require adult account holders. We keep the risk low by design instead ([online-safety.md](../../online-safety.md)): nothing is public, nobody can find or message a stranger, and the only words a person sees from someone else come from people they chose to work with.

## Why

- The data map first recommended an 18+ statement (gap 5 of #320) because a contract with a child is doubtful and AI providers require adult account holders. The owner would rather stay open to young writers.
- Under the Online Safety Act, a statement or tick-box is not "highly effective age assurance", so it cannot support a claim that children cannot access the service. We would still have to assess children's access and risk, and an age limit we know is unenforced could count against us.
- Highly effective age assurance (ID, a photo estimate, a bank or mobile-operator check) means a vendor, more personal data and a barrier to the writers we want, for a service whose children's risk is low.
- Contract capacity is manageable: an under-18 can make a contract for something of benefit to them, we do not rely on consent as our legal basis, and we ask for no date of birth.

## Consequences and alternatives

- We treat children as possible users: the DPIA covers them ([dpia.md](../../dpia.md)) and the ICO Children's Code is a design reference.
- The AI features need an API key from a provider that requires adult account holders, so they are in practice adult-only; we say so rather than excluding everyone.
- Any feature that lets strangers meet or lets words reach people who did not choose them (public pages, profiles, search of people, direct messages, open sign-up) means redoing the assessments first.
- Rejected: an 18+ statement (ineffective, and misleading to say it protects anyone); an age check at sign-up (cost, data and exclusion not justified by the risk); asking for a date of birth to switch features on and off (collects more than we need, and we have no features to switch).
- Reconsider if the terms are checked by a lawyer and found to need an age, if a feature in the "do not add" list is wanted, or if Ofcom guidance changes for small services.
