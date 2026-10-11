import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { useRoute } from 'vue-router'
import { api } from './api'
import { useProfile } from './useProfiles'

/**
 * Where a person is in the app, and what the side menu lists for it. The menu follows you (docs/design.md):
 *   home    -> Profiles, Account settings
 *   profile -> 01 Search, 02 Read, 03 Notes, 04 Ideas, and the profile's settings
 *   idea    -> 01 Research, 02 Notes, 03 Refine, 04 Draft, 05 Publish, and the idea's settings
 * The numbers orient; they never lock anything, so every step is always a link.
 * A page says which level and step it belongs to in its route's `meta` (see router.ts).
 */
export interface Step {
  key: string
  label: string
  /** The name of the step's route. */
  route: string
}

export const PROFILE_STEPS: Step[] = [
  { key: 'search', label: 'Search', route: 'search' },
  { key: 'read', label: 'Read', route: 'read' },
  { key: 'notes', label: 'Notes', route: 'profile-notes' },
  { key: 'ideas', label: 'Ideas', route: 'profile-ideas' },
]

export const IDEA_STEPS: Step[] = [
  { key: 'research', label: 'Research', route: 'idea-research' },
  { key: 'notes', label: 'Notes', route: 'idea-notes' },
  { key: 'refine', label: 'Refine', route: 'brainstorm' },
  { key: 'draft', label: 'Draft', route: 'idea-drafts' },
  { key: 'publish', label: 'Publish', route: 'idea-publish' },
]

export type NavLevel = 'home' | 'profile' | 'idea'

export const stepsFor = (level: NavLevel) =>
  level === 'idea' ? IDEA_STEPS : level === 'profile' ? PROFILE_STEPS : []

/** "01", "02" ... for a step, or '' when the page isn't a numbered step. */
export function stepNumber(level: NavLevel, key: string | undefined) {
  const index = stepsFor(level).findIndex((s) => s.key === key)
  return index < 0 ? '' : String(index + 1).padStart(2, '0')
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * What the side menu and step headings need to know about the current page. Reads only what pages already load
 * (the profiles list, the idea, the ideas list), so it adds little: TanStack Query shares them by key.
 */
export function useNav() {
  const route = useRoute()
  const routeId = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))
  const profileId = computed(() =>
    typeof route.params.profileId === 'string' ? route.params.profileId : '',
  )
  const { profile } = useProfile(() => profileId.value)

  // The drafting page's address names a draft, not its idea: find the idea from the draft.
  const draft = useQuery({
    queryKey: ['draft', profileId, routeId],
    queryFn: () => api.getDraft(profileId.value, routeId.value),
    enabled: computed(() => !!route.meta.ideaFromDraft && !!profileId.value && !!routeId.value),
  })
  const draftLoading = computed(() => !!route.meta.ideaFromDraft && draft.isPending.value)

  const ideaId = computed(() => {
    if (route.meta.level !== 'idea') return ''
    return route.meta.ideaFromDraft ? (draft.data.value?.ideaId ?? '') : routeId.value
  })
  const level = computed<NavLevel>(() => {
    const declared = route.meta.level
    if (!declared || !profileId.value) return 'home'
    // A draft that belongs to no idea sits with the profile's ideas.
    if (declared === 'idea' && !ideaId.value && !draftLoading.value) return 'profile'
    return declared
  })
  const stepKey = computed(() =>
    route.meta.level === 'idea' && level.value === 'profile' ? 'ideas' : route.meta.step,
  )

  const idea = useQuery({
    queryKey: ['idea', profileId, ideaId],
    queryFn: () => api.getIdea(profileId.value, ideaId.value),
    enabled: computed(() => !!ideaId.value),
  })
  const ideas = useQuery({
    queryKey: ['ideas', profileId],
    queryFn: () => api.listIdeas(profileId.value),
    enabled: computed(() => level.value === 'profile'),
  })

  /** The quiet line under a step: a count, where we already know one. */
  function metaFor(step: Step) {
    if (level.value === 'profile' && step.key === 'ideas' && ideas.data.value)
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
          ? { name: step.route, params: { profileId: profileId.value, id: ideaId.value } }
          : { name: step.route, params: { profileId: profileId.value } }
      return { ...step, number: String(index + 1).padStart(2, '0'), to, meta: metaFor(step) }
    }),
  )

  /** What the page is called above its title: the idea or the profile, depending on level. */
  const eyebrow = computed(() =>
    level.value === 'idea'
      ? idea.data.value?.name
      : level.value === 'profile'
        ? profile.value?.name
        : undefined,
  )

  return {
    level,
    profileId,
    ideaId,
    profile,
    idea,
    steps,
    stepKey,
    stepNumber: computed(() => stepNumber(level.value, stepKey.value)),
    eyebrow,
    /** Waiting to learn which idea a draft belongs to. */
    loading: draftLoading,
    /** The side menu folds away at every width (pages read beside another window). */
    compact: computed(() => !!route.meta.compact),
  }
}
