# Publication descriptions are written by the writer; AI drafting was removed (#150)

The owner removed "Draft from a few posts" (#134, #135, #136, and the later #149 plan to fetch whole posts and page back
through a site's feed). Drafting a description from sample posts spent the writer's tokens on a text that, under our own
responsible-AI rules (reflect only what the posts show, say when the evidence is thin, never guess readers, never write
what is published), was not worth what it cost, and fetching whole posts would have cost more. So nothing now creates an
AI-inferred description.

- **Removed:** the sample-posts picker, `POST /publications/:id/publication/{posts,samples,description}`, the publication-description prompt
  and its evals, `PageTextFetcher` (its port, HTTP adapter, fake, contract and readable-text extraction: nothing else used
  it), and the rate limiters that went with them. `PAGE_FETCHER` remains: it still chooses the page _title_ fetcher.
- **Instead, guidance.** The describe page opens on "What makes a useful description" (also folded above the editor in the
  publication settings): what it is, what it covers, who reads it (by interests and knowledge, never by who they are; say so
  when the writing is personal, so the assistants don't ask for an audience), how it is written, and what feedback the
  writer wants, with an example, and a note that it is the writer's account of the publication and is never read as
  instructions. The points follow how the prompts use the description (`prompts/brainstorm-rules.md`, `critique.md`,
  `research.md`).
- **Origin handling removed too (#151).** With nothing live to keep, a migration dropped `description_origin`,
  `description_confirmed`, `description_sources` and `description_edited`; the "AI draft" mark (`DescriptionOrigin`),
  `POST /publications/:id/description/confirm`, the unconfirmed check in `usablePublicationDescription` and the publication fields that
  carried them went with it. A description is always the writer's own words, and every saved one reaches the assistants.
