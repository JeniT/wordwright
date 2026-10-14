import { useQuery, useQueryClient, type QueryClient } from '@tanstack/vue-query'
import type { IdeaNote } from '@lfwa/core'
import { computed } from 'vue'
import { api } from './api'

/**
 * Every query key, and the queries several screens share, in one place. A key spelled out in a component drifts
 * from the others (a missing `?? 'profile'`, a different order), and then one screen's change doesn't reach another.
 * The first item of a key is its *root*: invalidating the root refreshes every query under it.
 */
export const queryKeys = {
  idea: (profileId: string, id: string | undefined) => ['idea', profileId, id] as const,
  ideas: (profileId: string) => ['ideas', profileId] as const,
  /** An idea's notes, or (no idea) the profile's own. */
  notes: (profileId: string, ideaId: string | null | undefined) =>
    ['notes', profileId, ideaId ?? 'profile'] as const,
  sources: (profileId: string) => ['sources', profileId] as const,
  draft: (profileId: string, id: string) => ['draft', profileId, id] as const,
  handover: (profileId: string, id: string) => ['draft-handover', profileId, id] as const,
  conversation: (profileId: string, ideaId: string) => ['conversation', profileId, ideaId] as const,
  research: (profileId: string, ideaId: string) => ['research', profileId, ideaId] as const,
  recentPosts: (profileId: string, days: number, feeds: string) =>
    ['recent-posts', profileId, days, feeds] as const,
}

export type QueryRoot =
  | 'conversation'
  | 'critique'
  | 'draft'
  | 'draft-handover'
  | 'draft-insertions'
  | 'idea'
  | 'ideas'
  | 'notes'
  | 'reading'
  | 'recent-posts'
  | 'research'
  | 'sources'

/** Refreshes everything under each root. */
export const invalidateRoots = (queryClient: QueryClient, ...roots: QueryRoot[]) =>
  Promise.all(roots.map((root) => queryClient.invalidateQueries({ queryKey: [root] })))

/** After a change to notes that may also have changed the idea or the drafts that use them. */
export const refreshNotesEverywhere = (queryClient: QueryClient) =>
  invalidateRoots(queryClient, 'notes', 'idea', 'ideas', 'draft-insertions')

/**
 * A change to an idea's notes or reading list also changes the idea's "last changed" time and its text as
 * brainstorming sees it. The profile's own notes belong to no idea, so nothing else shows them.
 */
export const refreshIdea = (
  queryClient: QueryClient,
  profileId: string,
  ideaId: string | null | undefined,
) =>
  ideaId
    ? Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.idea(profileId, ideaId) }),
        queryClient.invalidateQueries({ queryKey: ['ideas'] }),
      ])
    : Promise.resolve([])

// The arguments are getters, so a query follows a component's props as they change.
type Get<T> = () => T

export function useIdea(profileId: Get<string>, id: Get<string | undefined>) {
  return useQuery({
    queryKey: computed(() => queryKeys.idea(profileId(), id())),
    queryFn: () => api.getIdea(profileId(), id()!),
    enabled: () => !!id(),
  })
}

export function useIdeas(profileId: Get<string>, enabled: Get<boolean> = () => true) {
  return useQuery({
    queryKey: computed(() => queryKeys.ideas(profileId())),
    queryFn: () => api.listIdeas(profileId()),
    enabled,
  })
}

export function useSources(profileId: Get<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.sources(profileId())),
    queryFn: () => api.listSources(profileId()),
  })
}

export function useDraft(
  profileId: Get<string>,
  id: Get<string>,
  enabled: Get<boolean> = () => true,
) {
  return useQuery({
    queryKey: computed(() => queryKeys.draft(profileId(), id())),
    queryFn: () => api.getDraft(profileId(), id()),
    enabled,
  })
}

/** An idea's notes, or (`ideaId` null) the profile's own, with the ways the cache is changed without asking again. */
export function useIdeaNotes(profileId: Get<string>, ideaId: Get<string | null | undefined>) {
  const queryClient = useQueryClient()
  const notes = useQuery({
    queryKey: computed(() => queryKeys.notes(profileId(), ideaId())),
    queryFn: () => api.listIdeaNotes(profileId(), ideaId() ?? null),
  })
  const key = () => queryKeys.notes(profileId(), ideaId())
  /** Keeps what the server answered (or the notes as the change left them). */
  const set = (all: IdeaNote[] | ((old: IdeaNote[] | undefined) => IdeaNote[] | undefined)) =>
    queryClient.setQueryData<IdeaNote[]>(key(), all)
  const append = (note: IdeaNote) => set((old) => [...(old ?? []), note])
  return { notes, set, append, refreshIdea: () => refreshIdea(queryClient, profileId(), ideaId()) }
}
