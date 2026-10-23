import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { useRoute } from 'vue-router'
import { api } from './api'
import { queryKeys, useDraft, useIdea, useIdeaNotes, useSources } from './queries'
import { usePublication } from './usePublications'

/**
 * Where a person is in the app, and what the side menu lists for it. The menu follows you (docs/design.md):
 *   home    -> Publications (account settings: the gear by the person's name in the menu foot)
 *   publication -> 01 Scan, 02 Read, 03 Note, (its settings: a gear beside its name)
 *   publication-settings -> Details, Description, Sharing, Download, Delete (plain links; the way up is the publication)
 *   idea    -> 01 Research, 02 Read, 03 Note, 04 Refine, 05 Draft, (its settings: a gear beside its name)
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
  { key: 'scan', label: 'Scan', route: 'scan' },
  { key: 'read', label: 'Read', route: 'read' },
  { key: 'notes', label: 'Note', route: 'publication-notes' },
]

export const IDEA_STEPS: Step[] = [
  { key: 'research', label: 'Research', route: 'idea-research' },
  { key: 'read', label: 'Read', route: 'idea-read' },
  { key: 'notes', label: 'Note', route: 'idea-notes' },
  { key: 'refine', label: 'Refine', route: 'brainstorm' },
  { key: 'draft', label: 'Draft', route: 'idea-drafts' },
]

/** The account settings pages: plain links in the menu (settings are not a sequence, so no numbers). */
export const ACCOUNT_PAGES: Step[] = [
  { key: 'details', label: 'Your details', route: 'account-details' },
  { key: 'ai', label: 'Your AI', route: 'account-ai' },
  { key: 'display', label: 'Display', route: 'account-display' },
  { key: 'security', label: 'Sign-in and security', route: 'account-security' },
  { key: 'download', label: 'Download your writing', route: 'account-download' },
  { key: 'delete', label: 'Delete account', route: 'account-delete' },
]

/** A publication's settings pages. Like the account's, plain links; Details and Delete are for owners only. */
export interface SettingsPage extends Step {
  ownerOnly?: boolean
}
export const PUBLICATION_SETTINGS_PAGES: SettingsPage[] = [
  { key: 'details', label: 'Details', route: 'publication-settings-details', ownerOnly: true },
  { key: 'description', label: 'Description', route: 'publication-settings-description' },
  { key: 'feeds', label: 'Feeds', route: 'publication-settings-feeds' },
  { key: 'sharing', label: 'Sharing', route: 'publication-settings-sharing' },
  { key: 'download', label: 'Download', route: 'publication-settings-download' },
  {
    key: 'delete',
    label: 'Delete publication',
    route: 'publication-settings-delete',
    ownerOnly: true,
  },
]

export type NavLevel = 'home' | 'publication' | 'publication-settings' | 'idea' | 'account'

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
 * (the publications list, the idea), so it adds little: TanStack Query shares them by key.
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
    if (declared === 'account') return 'account'
    if (!declared || !publicationId.value) return 'home'
    // A draft that belongs to no idea sits with the publication.
    if (declared === 'idea' && !ideaId.value && !draftLoading.value) return 'publication'
    return declared
  })
  const stepKey = computed(() =>
    route.meta.level === 'idea' && level.value === 'publication' ? undefined : route.meta.step,
  )

  const idea = useIdea(
    () => publicationId.value,
    () => ideaId.value,
  )
  // Counts for the quiet line under each step. They share their queries with the pages (and the landing page's
  // summaries), so showing them costs one request each, once.
  const atPublication = () => level.value === 'publication'
  const atIdea = () => level.value === 'idea' && !!ideaId.value
  const feeds = useSources(() => publicationId.value, atPublication)
  const reading = useQuery({
    queryKey: ['reading', () => publicationId.value],
    queryFn: () => api.listPublicationReading(publicationId.value),
    enabled: atPublication,
  })
  const publicationNotes = useIdeaNotes(
    () => publicationId.value,
    () => null,
    atPublication,
  ).notes
  const ideaNotes = useIdeaNotes(
    () => publicationId.value,
    () => ideaId.value,
    atIdea,
  ).notes

  // The pages your AI suggested that are still waiting for a decision; the Research page shares this query.
  const research = useQuery({
    queryKey: computed(() => queryKeys.research(publicationId.value, ideaId.value)),
    queryFn: () => api.getResearch(publicationId.value, ideaId.value),
    enabled: atIdea,
  })

  /** The quiet line under a step: a count, where we already know one. */
  function metaFor(step: Step) {
    if (level.value === 'publication') {
      if (step.key === 'scan' && feeds.data.value)
        return plural(feeds.data.value.length, 'feed', 'feeds')
      if (step.key === 'read' && reading.data.value)
        return `${reading.data.value.filter((l) => !l.readAt).length} to read`
      if (step.key === 'notes' && publicationNotes.data.value)
        return plural(publicationNotes.data.value.length, 'note', 'notes')
    }
    if (level.value === 'idea' && idea.data.value) {
      if (step.key === 'research' && research.data.value) {
        const waiting = research.data.value
          .flatMap((run) => run.items)
          .filter((i) => i.status === 'suggested')
        return plural(waiting.length, 'suggestion', 'suggestions')
      }
      if (step.key === 'read')
        return `${idea.data.value.links.filter((l) => !l.readAt).length} to read`
      if (step.key === 'notes' && ideaNotes.data.value)
        return plural(ideaNotes.data.value.length, 'note', 'notes')
      if (step.key === 'refine')
        return plural(idea.data.value.pendingSuggestions, 'suggestion', 'suggestions')
      // A published draft is no longer a draft, though the Draft page still lists it.
      if (step.key === 'draft')
        return plural(
          idea.data.value.drafts.filter((d) => !d.publishedAt).length,
          'draft',
          'drafts',
        )
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

  const accountPages = computed(() =>
    ACCOUNT_PAGES.map((page) => ({ ...page, to: { name: page.route } as RouteLocationRaw })),
  )

  /** The publication's settings pages this person can use: members have no Details (nothing there is theirs to change) or Delete. */
  const settingsPages = computed(() =>
    PUBLICATION_SETTINGS_PAGES.filter(
      (page) => !page.ownerOnly || publication.value?.role === 'owner',
    ).map((page) => ({
      ...page,
      to: { name: page.route, params: { publicationId: publicationId.value } } as RouteLocationRaw,
    })),
  )

  /** What the page is called above its title: the idea or the publication, depending on level. */
  const eyebrow = computed(() =>
    level.value === 'idea'
      ? idea.data.value?.name
      : level.value === 'publication'
        ? publication.value?.name
        : level.value === 'account'
          ? 'Account settings'
          : level.value === 'publication-settings'
            ? 'Publication settings'
            : undefined,
  )

  /** Where the name above a page's title leads: a level's pages lead back to its landing page (not from it). */
  const eyebrowTo = computed<RouteLocationRaw | undefined>(() => {
    if (level.value === 'account')
      return route.name === 'account-details' ? undefined : { name: 'account-details' }
    if (level.value === 'publication-settings') {
      const first = settingsPages.value[0]
      return !first || route.name === first.route ? undefined : first.to
    }
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
    accountPages,
    settingsPages,
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
