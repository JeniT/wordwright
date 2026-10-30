import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { Idea, Article } from '@wordwright/core'
import { computed } from 'vue'
import { api } from './api'
import { invalidateRoots, queryKeys, useIdea } from './queries'

/**
 * Whose articles or notes a page is working on: an idea's, or (`ideaId` null) the publication's own, gathered
 * before there is an idea. The same screens serve both; only where they read and write differs.
 */
export interface Owner {
  publicationId: string
  ideaId: string | null
}

/** The route of an item's reading page. */
export const articleRoute = (owner: Owner, articleId: string) =>
  owner.ideaId
    ? {
        name: 'article',
        params: { publicationId: owner.publicationId, id: owner.ideaId, articleId },
      }
    : { name: 'publication-article', params: { publicationId: owner.publicationId, articleId } }

/** Where "back" goes from a reading page. */
export const articleBackRoute = (owner: Owner) =>
  owner.ideaId
    ? { name: 'idea-read', params: { publicationId: owner.publicationId, id: owner.ideaId } }
    : { name: 'read', params: { publicationId: owner.publicationId } }

/**
 * Changes to a list of articles: add, mark read, edit, remove. Each keeps what the server answered, so every screen
 * showing the list is up to date.
 */
export function useArticleActions(owner: () => Owner) {
  const queryClient = useQueryClient()
  /** Keeps what the server answered, and anything else that shows the list or when the idea changed. */
  function keep(saved: Idea | Article[]) {
    const { publicationId, ideaId } = owner()
    if (Array.isArray(saved)) queryClient.setQueryData(queryKeys.articles(publicationId), saved)
    else queryClient.setQueryData(queryKeys.idea(publicationId, ideaId ?? undefined), saved)
    // The ideas' lists show when each last changed; nothing here waits for them.
    void invalidateRoots(queryClient, 'ideas')
  }
  const listOf = (saved: Idea | Article[]) => (Array.isArray(saved) ? saved : saved.articles)

  /** Adds an item (its title is looked up); answers with the whole list afterwards. */
  const add = useMutation({
    mutationFn: async (url: string) => {
      const { publicationId, ideaId } = owner()
      return ideaId
        ? api.addIdeaArticle(publicationId, ideaId, { url })
        : api.addPublicationArticle(publicationId, { url })
    },
    onSuccess: keep,
  })
  const setRead = useMutation({
    mutationFn: ({ articleId, read }: { articleId: string; read: boolean }) => {
      const { publicationId, ideaId } = owner()
      return ideaId
        ? api.setArticleRead(publicationId, ideaId, articleId, read)
        : api.setPublicationArticleRead(publicationId, articleId, read)
    },
    onSuccess: keep,
  })
  /** Keeps an item of the publication's own list, or stops keeping it. */
  const setKept = useMutation({
    mutationFn: ({ articleId, kept }: { articleId: string; kept: boolean }) =>
      api.setPublicationArticleKept(owner().publicationId, articleId, kept),
    onSuccess: keep,
  })
  /** Gives an item exactly these tags. */
  const setTags = useMutation({
    mutationFn: ({ articleId, tags }: { articleId: string; tags: string[] }) => {
      const { publicationId, ideaId } = owner()
      return ideaId
        ? api.setArticleTags(publicationId, ideaId, articleId, tags)
        : api.setPublicationArticleTags(publicationId, articleId, tags)
    },
    onSuccess: keep,
  })
  /** Adds and removes tags on several items at once (a bulk Tag…). */
  const tagMany = useMutation({
    mutationFn: (change: { ids: string[]; add: string[]; remove: string[] }) => {
      const { publicationId, ideaId } = owner()
      return ideaId
        ? api.tagIdeaArticles(publicationId, ideaId, change)
        : api.tagPublicationArticles(publicationId, change)
    },
    onSuccess: keep,
  })
  const update = useMutation({
    mutationFn: ({
      articleId,
      ...input
    }: {
      articleId: string
      url: string
      title: string
      authors?: string[]
    }) => {
      const { publicationId, ideaId } = owner()
      return ideaId
        ? api.updateIdeaArticle(publicationId, ideaId, articleId, input)
        : api.updatePublicationArticle(publicationId, articleId, input)
    },
    onSuccess: keep,
  })
  const remove = useMutation({
    mutationFn: (articleId: string) => {
      const { publicationId, ideaId } = owner()
      return ideaId
        ? api.removeIdeaArticle(publicationId, ideaId, articleId)
        : api.removePublicationArticle(publicationId, articleId)
    },
    onSuccess: () => invalidateRoots(queryClient, 'idea', 'articles'),
  })

  /** Removes several at once (a bulk Remove). Each is tried even if an earlier one failed; the list is read again after. */
  const removeMany = useMutation({
    mutationFn: async (articleIds: string[]) => {
      const { publicationId, ideaId } = owner()
      const results = await Promise.allSettled(
        articleIds.map((articleId) =>
          ideaId
            ? api.removeIdeaArticle(publicationId, ideaId, articleId)
            : api.removePublicationArticle(publicationId, articleId),
        ),
      )
      if (results.some((r) => r.status === 'rejected'))
        throw new Error('Some articles could not be removed.')
    },
    onSettled: () => invalidateRoots(queryClient, 'idea', 'articles'),
  })

  return { add, setRead, setKept, setTags, tagMany, update, remove, removeMany, listOf }
}

/**
 * The articles of an idea or of the publication, as one list of items. For an idea this is the idea's own query
 * (which the idea page shares), so a change made here shows there at once.
 */
export function useArticleList(owner: () => Owner) {
  const forIdea = computed(() => !!owner().ideaId)
  const idea = useIdea(
    () => owner().publicationId,
    () => owner().ideaId ?? undefined,
  )
  const own = useQuery({
    queryKey: computed(() => queryKeys.articles(owner().publicationId)),
    queryFn: () => api.listPublicationArticles(owner().publicationId),
    enabled: computed(() => !forIdea.value),
  })
  const query = computed(() => (forIdea.value ? idea : own))
  const articles = computed<Article[] | undefined>(() =>
    forIdea.value ? idea.data.value?.articles : own.data.value,
  )
  return {
    articles,
    /** The idea itself (an idea's list only): its name, for a way back. */
    idea: computed(() => idea.data.value),
    isPending: computed(() => query.value.isPending.value),
    isError: computed(() => query.value.isError.value),
    refetch: () => query.value.refetch(),
    ...useArticleActions(owner),
  }
}
