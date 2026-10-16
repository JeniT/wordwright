import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { useRoute } from 'vue-router'
import { useDraft, useIdea, useIdeas } from './queries'
import { usePublication } from './usePublications'

/**
 * Where a person is in the app, and what the side menu lists for it. The menu follows you (docs/design.md):
 *   home    -> Publications (account settings: the gear by the person's name in the menu foot)
 *   publication -> 01 Search, 02 Read, 03 Notes, 04 Ideas, (its settings: a gear beside its name)
 *   idea    -> 01 Research, 02 Notes, 03 Refine, 04 Draft, (its settings: a gear beside its name)
 * The numbers orient; they never lock anything, so every step is always a link.
 * A page says which level and step it belongs to in its route's `meta` (see router.ts).
 */
export interface Step {
  key: string
  label: string
  /** The name of the step's route. */
  route: string
}

export const PUBLICATION_STEPS: Step[] = [
  { key: 'search', label: 'Search', route: 'search' },
  { key: 'read', label: 'Read', route: 'read' },
  { key: 'notes', label: 'Notes', route: 'publication-notes' },
  { key: 'ideas', label: 'Ideas', route: 'publication-ideas' },
]

export const IDEA_STEPS: Step[] = [
  { key: 'research', label: 'Research', route: 'idea-research' },
  { key: 'notes', label: 'Notes', route: 'idea-notes' },
  { key: 'refine', label: 'Refine', route: 'brainstorm' },
  { key: 'draft', label: 'Draft', route: 'idea-drafts' },
]

export type NavLevel = 'home' | 'publication' | 'idea'

export const stepsFor = (level: NavLevel) =>
  level === 'idea' ? IDEA_STEPS : level === 'publication' ? PUBLICATION_STEPS : []

/** "01", "02" ... for a step, or '' when the page isn't a numbered step. */
export function stepNumber(level: NavLevel, key: string | undefined) {
  const index = stepsFor(level).findIndex((s) => s.key === key)
  return index < 0 ? '' : String(index + 1).padStart(2, '0')
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * What the side menu and step headings need to know about the current page. Reads only what pages already load
 * (the publications list, the idea, the ideas list), so it adds little: TanStack Query shares them by key.
 */
export function useNav() {
  const route = useRoute()
  const routeId = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))
  const publicationId = computed(() =>
    typeof route.params.publicationId === 'string' ? route.params.publicationId : '',
  )
  const { publication } = usePublication(() => publicationId.value)

  // The drafting page's address names a draft, not its idea: find the idea from the draft.
  const draft = useDraft(
    () => publicationId.value,
    () => routeId.value,
    () => !!route.meta.ideaFromDraft && !!publicationId.value && !!routeId.value,
  )
  const draftLoading = computed(() => !!route.meta.ideaFromDraft && draft.isPending.value)

  const ideaId = computed(() => {
    if (route.meta.level !== 'idea') return ''
    return route.meta.ideaFromDraft ? (draft.data.value?.ideaId ?? '') : routeId.value
  })
  const level = computed<NavLevel>(() => {
    const declared = route.meta.level
    if (!declared || !publicationId.value) return 'home'
    // A draft that belongs to no idea sits with the publication's ideas.
    if (declared === 'idea' && !ideaId.value && !draftLoading.value) return 'publication'
    return declared
  })
  const stepKey = computed(() =>
    route.meta.level === 'idea' && level.value === 'publication' ? 'ideas' : route.meta.step,
  )

  const idea = useIdea(
    () => publicationId.value,
    () => ideaId.value,
  )
  const ideas = useIdeas(
    () => publicationId.value,
    () => level.value === 'publication',
  )

  /** The quiet line under a step: a count, where we already know one. */
  function metaFor(step: Step) {
    if (level.value === 'publication' && step.key === 'ideas' && ideas.data.value)
      return plural(ideas.data.value.length, 'idea', 'ideas')
    if (level.value === 'idea' && idea.data.value) {
      if (step.key === 'research') return plural(idea.data.value.links.length, 'source', 'sources')
      if (step.key === 'draft') return plural(idea.data.value.drafts.length, 'draft', 'drafts')
    }
    return ''
  }

  const steps = computed(() =>
    stepsFor(level.value).map((step, index) => {
      const to: RouteLocationRaw =
        level.value === 'idea'
          ? { name: step.route, params: { publicationId: publicationId.value, id: ideaId.value } }
          : { name: step.route, params: { publicationId: publicationId.value } }
      return { ...step, number: String(index + 1).padStart(2, '0'), to, meta: metaFor(step) }
    }),
  )

  /** What the page is called above its title: the idea or the publication, depending on level. */
  const eyebrow = computed(() =>
    level.value === 'idea'
      ? idea.data.value?.name
      : level.value === 'publication'
        ? publication.value?.name
        : undefined,
  )

  /** Where the name above a page's title leads: a level's pages lead back to its landing page (not from it). */
  const eyebrowTo = computed<RouteLocationRaw | undefined>(() => {
    if (route.name === 'publication' || route.name === 'idea' || !publicationId.value)
      return undefined
    if (level.value === 'publication')
      return { name: 'publication', params: { publicationId: publicationId.value } }
    if (level.value === 'idea' && ideaId.value)
      return { name: 'idea', params: { publicationId: publicationId.value, id: ideaId.value } }
    return undefined
  })

  return {
    level,
    publicationId,
    ideaId,
    publication,
    idea,
    steps,
    stepKey,
    stepNumber: computed(() => stepNumber(level.value, stepKey.value)),
    eyebrow,
    eyebrowTo,
    /** Waiting to learn which idea a draft belongs to. */
    loading: draftLoading,
    /** The side menu folds away at every width (pages read beside another window). */
    compact: computed(() => !!route.meta.compact),
  }
}
