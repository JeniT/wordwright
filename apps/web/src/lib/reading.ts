import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { Idea, IdeaLink } from '@lfwa/core'
import { computed } from 'vue'
import { api } from './api'

/**
 * Whose reading list or notes a page is working on: an idea's, or (`ideaId` null) the profile's own, gathered
 * before there is an idea. The same screens serve both; only where they read and write differs.
 */
export interface Owner {
  profileId: string
  ideaId: string | null
}

/** The route of an item's reading page. */
export const readingRoute = (owner: Owner, linkId: string) =>
  owner.ideaId
    ? { name: 'reading', params: { profileId: owner.profileId, id: owner.ideaId, linkId } }
    : { name: 'profile-reading-item', params: { profileId: owner.profileId, linkId } }

/** Where "back" goes from a reading page. */
export const readingBackRoute = (owner: Owner) =>
  owner.ideaId
    ? { name: 'idea-research', params: { profileId: owner.profileId, id: owner.ideaId } }
    : { name: 'read', params: { profileId: owner.profileId } }

/**
 * Changes to a reading list: add, mark read, edit, remove. Each keeps what the server answered, so every screen
 * showing the list is up to date.
 */
export function useReadingActions(owner: () => Owner) {
  const queryClient = useQueryClient()
  /** Keeps what the server answered, and anything else that shows the list or when the idea changed. */
  function keep(saved: Idea | IdeaLink[]) {
    const { profileId, ideaId } = owner()
    if (Array.isArray(saved)) queryClient.setQueryData(['reading', profileId], saved)
    else queryClient.setQueryData(['idea', profileId, ideaId], saved)
    // The ideas' lists show when each last changed; nothing here waits for them.
    void queryClient.invalidateQueries({ queryKey: ['ideas'] })
  }
  const listOf = (saved: Idea | IdeaLink[]) => (Array.isArray(saved) ? saved : saved.links)

  /** Adds an item (its title is looked up); answers with the whole list afterwards. */
  const add = useMutation({
    mutationFn: async (url: string) => {
      const { profileId, ideaId } = owner()
      return ideaId
        ? api.addIdeaLink(profileId, ideaId, { url })
        : api.addProfileLink(profileId, { url })
    },
    onSuccess: keep,
  })
  const setRead = useMutation({
    mutationFn: ({ linkId, read }: { linkId: string; read: boolean }) => {
      const { profileId, ideaId } = owner()
      return ideaId
        ? api.setReadingItemRead(profileId, ideaId, linkId, read)
        : api.setProfileLinkRead(profileId, linkId, read)
    },
    onSuccess: keep,
  })
  /** Keeps an item of the profile's own list, or stops keeping it. */
  const setKept = useMutation({
    mutationFn: ({ linkId, kept }: { linkId: string; kept: boolean }) =>
      api.setProfileLinkKept(owner().profileId, linkId, kept),
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
      const { profileId, ideaId } = owner()
      return ideaId
        ? api.updateIdeaLink(profileId, ideaId, linkId, input)
        : api.updateProfileLink(profileId, linkId, input)
    },
    onSuccess: keep,
  })
  const remove = useMutation({
    mutationFn: (linkId: string) => {
      const { profileId, ideaId } = owner()
      return ideaId
        ? api.removeIdeaLink(profileId, ideaId, linkId)
        : api.removeProfileLink(profileId, linkId)
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['idea'] }),
        queryClient.invalidateQueries({ queryKey: ['reading'] }),
      ]),
  })

  /** Removes several at once (a bulk Remove). Each is tried even if an earlier one failed; the list is read again after. */
  const removeMany = useMutation({
    mutationFn: async (linkIds: string[]) => {
      const { profileId, ideaId } = owner()
      const results = await Promise.allSettled(
        linkIds.map((linkId) =>
          ideaId
            ? api.removeIdeaLink(profileId, ideaId, linkId)
            : api.removeProfileLink(profileId, linkId),
        ),
      )
      if (results.some((r) => r.status === 'rejected'))
        throw new Error('Some links could not be removed.')
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['idea'] }),
        queryClient.invalidateQueries({ queryKey: ['reading'] }),
      ]),
  })

  return { add, setRead, setKept, update, remove, removeMany, listOf }
}

/**
 * The reading list of an idea or of the profile, as one list of items. For an idea this is the idea's own query
 * (which the idea page shares), so a change made here shows there at once.
 */
export function useReadingList(owner: () => Owner) {
  const forIdea = computed(() => !!owner().ideaId)
  const idea = useQuery({
    queryKey: ['idea', () => owner().profileId, () => owner().ideaId],
    queryFn: () => api.getIdea(owner().profileId, owner().ideaId!),
    enabled: forIdea,
  })
  const own = useQuery({
    queryKey: ['reading', () => owner().profileId],
    queryFn: () => api.listProfileReading(owner().profileId),
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
