import { RESEARCH_ATTEMPTS, type ResearchRun } from '@wordwright/core'

/** A search the queue still has: waiting its turn (or to be tried again), or searching (#447). */
export const inProgress = (run: ResearchRun) => run.state === 'waiting' || run.state === 'searching'

const retrying = (run: ResearchRun) =>
  `trying again (attempt ${run.attempt} of ${RESEARCH_ATTEMPTS})`

/** Where a search that isn't finished is, said in full on the Research page, where its pages would be. */
export function researchStateLine(run: ResearchRun): string {
  if (run.state === 'failed') return run.error ?? 'This search didn’t work. Try again.'
  if (inProgress(run) && run.attempt > 1) return `That didn’t work, so ${retrying(run)}.`
  if (run.state === 'waiting') return 'Waiting for another search to finish.'
  return 'Searching the web. This can take up to a minute.'
}

/** One short line on any run, for the idea's landing page. */
export function researchSummary(run: ResearchRun): string {
  if (run.state === 'finished') {
    const found = run.items.length
    if (!found) return 'Nothing worth reading turned up'
    const added = run.items.filter((i) => i.status === 'added').length
    const pages = found === 1 ? 'Found 1 page' : `Found ${found} pages`
    return added ? `${pages}, ${added} added` : pages
  }
  if (run.state === 'failed') return `Didn’t work: ${run.error ?? 'try again'}`
  if (run.attempt > 1) return retrying(run).replace(/^t/, 'T')
  return run.state === 'waiting' ? 'Waiting' : 'Searching the web…'
}
