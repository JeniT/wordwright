import { reactive } from 'vue'
import { RESEARCH_IN_FLIGHT_MAX, type ResearchRun } from '@wordwright/core'

/**
 * The searches this tab has sent to the writer's AI for Research (#446). Several can run at once, so each has its
 * own state, and they are kept here rather than in the form: moving to another page of the app leaves the request
 * running, and the form shows it again on the way back. Closing or reloading the tab stops it (the server then
 * keeps nothing), so the browser asks first while one is running.
 */
export interface ResearchSearch {
  key: number
  publicationId: string
  ideaId: string
  areas: string
  state: 'searching' | 'failed' | 'finished'
  error: unknown
  run: ResearchRun | null
}

const searches = reactive<ResearchSearch[]>([])
let nextKey = 0

/** This idea's searches, oldest first. */
export function searchesFor(publicationId: string, ideaId: string): ResearchSearch[] {
  return searches.filter((s) => s.publicationId === publicationId && s.ideaId === ideaId)
}

/** Whether as many searches as the server allows are running in this publication from this tab. */
export function atSearchLimit(publicationId: string): boolean {
  return (
    searches.filter((s) => s.publicationId === publicationId && s.state === 'searching').length >=
    RESEARCH_IN_FLIGHT_MAX
  )
}

/**
 * Sends a search with `send` and follows it. Pass `again` to retry a failed search in its own place. Resolves with
 * the run once it is saved, or with null if it failed (the failure is on the search).
 */
export async function trackSearch(
  where: { publicationId: string; ideaId: string; areas: string },
  send: () => Promise<ResearchRun>,
  again?: ResearchSearch,
): Promise<ResearchRun | null> {
  let search = again
  if (search) {
    Object.assign(search, { state: 'searching', error: null })
  } else {
    searches.push({ key: ++nextKey, ...where, state: 'searching', error: null, run: null })
    search = searches.at(-1)! // the reactive copy, so changes to it show
  }
  guardUnload()
  try {
    const run = await send()
    Object.assign(search, { state: 'finished', run })
    return run
  } catch (error) {
    Object.assign(search, { state: 'failed', error })
    return null
  } finally {
    guardUnload()
  }
}

/** Takes a failed or finished search off the list. */
export function forgetSearch(key: number): void {
  const at = searches.findIndex((s) => s.key === key)
  if (at !== -1) searches.splice(at, 1)
}

/** Takes this idea's finished searches off the list (the Research page shows every run anyway). */
export function forgetFinished(publicationId: string, ideaId: string): void {
  for (const s of searchesFor(publicationId, ideaId)) {
    if (s.state === 'finished') forgetSearch(s.key)
  }
}

/** For tests: starts each with nothing running. */
export function clearSearches(): void {
  searches.splice(0)
  guardUnload()
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault()
  event.returnValue = ''
}
let guarding = false
/** While a search is running, leaving the tab asks first, since the search would stop and nothing be kept. */
function guardUnload() {
  const want = searches.some((s) => s.state === 'searching')
  if (want === guarding || typeof window === 'undefined') return
  guarding = want
  if (want) window.addEventListener('beforeunload', onBeforeUnload)
  else window.removeEventListener('beforeunload', onBeforeUnload)
}
