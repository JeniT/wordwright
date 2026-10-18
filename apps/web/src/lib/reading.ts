import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { Idea, IdeaLink } from '@wordwright/core'
import { computed } from 'vue'
import { api } from './api'
import { invalidateRoots, queryKeys, useIdea } from './queries'

/**
 * Whose reading list or notes a page is working on: an idea's, or (`ideaId` null) the publication's own, gathered
 * before there is an idea. The same screens serve both; only where they read and write differs.
 */
export interface Owner {
  publicationId: string
  ideaId: string | null
}

/** The route of an item's reading page. */
export const readingRoute = (owner: Owner, linkId: string) =>
  owner.ideaId
    ? { name: 'reading', params: { publicationId: owner.publicationId, id: owner.ideaId, linkId } }
    : { name: 'publication-reading-item', params: { publicationId: owner.publicationId, linkId } }

/** Where "back" goes from a reading page. */
export const readingBackRoute = (owner: Owner) =>
  owner.ideaId
    ? { name: 'idea-read', params: { publicationId: owner.publicationId, id: owner.ideaId } }
    : { name: 'read', params: { publicationId: owner.publicationId } }

/**
 * Changes to a reading list: add, mark read, edit, remove. Each keeps what the server answered, so every screen
 * showing the list is up to date.
 */
export function useReadingActions(owner: () => Owner) {
  const queryClient = useQueryClient()
  /** Keeps what the server answered, and anything else that shows the list or when the idea changed. */
  function keep(saved: Idea | IdeaLink[]) {
    const { publicationId, ideaId } = owner()
    if (Array.isArray(saved)) queryClient.setQueryData(['reading', publicationId], saved)
    else queryClient.setQueryData(queryKeys.idea(publicationId, ideaId ?? undefined), saved)
    // The ideas' lists show when each last changed; nothing here waits for them.
    void invalidateRoots(queryClient, 'ideas')
  }
  const listOf = (saved: Idea | IdeaLink[]) => (Array.isArray(saved) ? saved : saved.links)

  /** Adds an item (its title is looked up); answers with the whole list afterwards. */
  const add = useMutation({
    mutationFn: async (url: string) => {
      const { publicationId, ideaId } = owner()
      return ideaId
        ? api.addIdeaLink(publicationId, ideaId, { url })
        : api.addPublicationLink(publicationId, { url })
    },
    onSuccess: keep,
  })
  const setRead = useMutation({
    mutationFn: ({ linkId, read }: { linkId: string; read: boolean }) => {
      const { publicationId, ideaId } = owner()
      return ideaId
        ? api.setReadingItemRead(publicationId, ideaId, linkId, read)
        : api.setPublicationLinkRead(publicationId, linkId, read)
    },
    onSuccess: keep,
  })
  /** Keeps an item of the publication's own list, or stops keeping it. */
  const setKept = useMutation({
    mutationFn: ({ linkId, kept }: { linkId: string; kept: boolean }) =>
      api.setPublicationLinkKept(owner().publicationId, linkId, kept),
    onSuccess: keep,
  })
  /** Gives an item exactly these tags. */
  const setTags = useMutation({
    mutationFn: ({ linkId, tags }: { linkId: string; tags: string[] }) => {
      const { publicationId, ideaId } = owner()
      return ideaId
        ? api.setReadingItemTags(publicationId, ideaId, linkId, tags)
        : api.setPublicationLinkTags(publicationId, linkId, tags)
    },
    onSuccess: keep,
  })
  /** Adds and removes tags on several items at once (a bulk Tag…). */
  const tagMany = useMutation({
    mutationFn: (change: { ids: string[]; add: string[]; remove: string[] }) => {
      const { publicationId, ideaId } = owner()
      return ideaId
        ? api.tagIdeaLinks(publicationId, ideaId, change)
        : api.tagPublicationLinks(publicationId, change)
    },
    onSuccess: keep,
  })
  const update = useMutation({
    mutationFn: ({
      linkId,
      ...input
    }: {
      linkId: string
      url: string
      title: string
      authors?: string[]
    }) => {
      const { publicationId, ideaId } = owner()
      return ideaId
        ? api.updateIdeaLink(publicationId, ideaId, linkId, input)
        : api.updatePublicationLink(publicationId, linkId, input)
    },
    onSuccess: keep,
  })
  const remove = useMutation({
    mutationFn: (linkId: string) => {
      const { publicationId, ideaId } = owner()
      return ideaId
        ? api.removeIdeaLink(publicationId, ideaId, linkId)
        : api.removePublicationLink(publicationId, linkId)
    },
    onSuccess: () => invalidateRoots(queryClient, 'idea', 'reading'),
  })

  /** Removes several at once (a bulk Remove). Each is tried even if an earlier one failed; the list is read again after. */
  const removeMany = useMutation({
    mutationFn: async (linkIds: string[]) => {
      const { publicationId, ideaId } = owner()
      const results = await Promise.allSettled(
        linkIds.map((linkId) =>
          ideaId
            ? api.removeIdeaLink(publicationId, ideaId, linkId)
            : api.removePublicationLink(publicationId, linkId),
        ),
      )
      if (results.some((r) => r.status === 'rejected'))
        throw new Error('Some links could not be removed.')
    },
    onSettled: () => invalidateRoots(queryClient, 'idea', 'reading'),
  })

  return { add, setRead, setKept, setTags, tagMany, update, remove, removeMany, listOf }
}

/**
 * The reading list of an idea or of the publication, as one list of items. For an idea this is the idea's own query
 * (which the idea page shares), so a change made here shows there at once.
 */
export function useReadingList(owner: () => Owner) {
  const forIdea = computed(() => !!owner().ideaId)
  const idea = useIdea(
    () => owner().publicationId,
    () => owner().ideaId ?? undefined,
  )
  const own = useQuery({
    queryKey: ['reading', () => owner().publicationId],
    queryFn: () => api.listPublicationReading(owner().publicationId),
    enabled: computed(() => !forIdea.value),
  })
  const query = computed(() => (forIdea.value ? idea : own))
  const links = computed<IdeaLink[] | undefined>(() =>
    forIdea.value ? idea.data.value?.links : own.data.value,
  )
  return {
    links,
    /** The idea itself (an idea's list only): its name, for a way back. */
    idea: computed(() => idea.data.value),
    isPending: computed(() => query.value.isPending.value),
    isError: computed(() => query.value.isError.value),
    refetch: () => query.value.refetch(),
    ...useReadingActions(owner),
  }
}
