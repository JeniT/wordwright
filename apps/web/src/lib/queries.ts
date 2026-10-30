import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/vue-query'
import {
  ACTIVE_DRAFTS_PAGE,
  type CommentInput,
  type Draft,
  type DraftPublishedInput,
  type IdeaNote,
} from '@wordwright/core'
import { computed, type Ref } from 'vue'
import { api } from './api'

/** Where Keep writing looks: one publication, one idea, or (neither) across everything the person edits. */
export type ActiveScope = { publicationId?: string; ideaId?: string }

/**
 * Every query key, and the queries several screens share, in one place. A key spelled out in a component drifts
 * from the others (a missing `?? 'publication'`, a different order), and then one screen's change doesn't reach another.
 * The first item of a key is its *root*: invalidating the root refreshes every query under it.
 */
export const queryKeys = {
  idea: (publicationId: string, id: string | undefined) => ['idea', publicationId, id] as const,
  ideas: (publicationId: string) => ['ideas', publicationId] as const,
  ideaMovePreview: (publicationId: string, ids: string[], to: string) =>
    ['idea-move-preview', publicationId, to, ...[...ids].sort()] as const,
  /** An idea's notes, or (no idea) the publication's own. */
  notes: (publicationId: string, ideaId: string | null | undefined) =>
    ['notes', publicationId, ideaId ?? 'publication'] as const,
  sources: (publicationId: string) => ['sources', publicationId] as const,
  draft: (publicationId: string, id: string) => ['draft', publicationId, id] as const,
  attention: (publicationId: string) => ['attention', publicationId] as const,
  /** Where the person is signed in (the account page). */
  devices: () => ['devices'] as const,
  /** The person's saved AI key settings (never the key itself). */
  llm: () => ['llm'] as const,
  /** The models the provider offers the saved key (the account page). */
  llmModels: () => ['llm-models'] as const,
  reviews: () => ['reviews'] as const,
  /** The publications the person belongs to. */
  publications: () => ['publications'] as const,
  /** A publication the list does not have (moved or gone), asked for by its id. */
  publicationMoved: (id: string) => ['publication-moved', id] as const,
  /** The signed-in person, as the account page reads them. */
  me: () => ['me'] as const,
  /** Which ways of signing in the server offers. */
  authConfig: () => ['auth-config'] as const,
  critiqueSettings: () => ['critique-settings'] as const,
  /** A publication's own articles (an idea's are part of the idea). */
  articles: (publicationId: string) => ['articles', publicationId] as const,
  /** The people invited to a publication, waiting to answer. */
  invitations: (publicationId: string) => ['invitations', publicationId] as const,
  /** An invitation to join a publication, previewed by the token in its link. */
  invitation: (token: string) => ['invitation', token] as const,
  reviewInvitation: (token: string) => ['review-invitation', token] as const,
  /** Who is waiting and who is in, for an admin (#328). */
  adminAccounts: () => ['admin-accounts'] as const,
  /** Invitations to join a publication that are waiting for this person. */
  myInvitations: () => ['my-invitations'] as const,
  /** The inviters this person has blocked, and whether they block everyone. */
  invitationBlocks: () => ['invitation-blocks'] as const,
  /** The drafts to keep writing, within a publication or an idea or (neither) across all of them, `limit` of them. */
  activeDrafts: (scope: ActiveScope, limit: number) =>
    ['active-drafts', scope.publicationId ?? null, scope.ideaId ?? null, limit] as const,
  review: (id: string) => ['review', id] as const,
  reviewers: (publicationId: string, id: string) => ['draft-reviewers', publicationId, id] as const,
  handover: (publicationId: string, id: string) => ['draft-handover', publicationId, id] as const,
  comments: (publicationId: string, draftId: string) =>
    ['comments', publicationId, draftId] as const,
  critique: (publicationId: string, draftId: string) =>
    ['critique', publicationId, draftId] as const,
  /** An idea's conversations, as a list (its roots are shared with each conversation, so one refresh does both). */
  conversations: (publicationId: string, ideaId: string) =>
    ['conversation', publicationId, ideaId, 'list'] as const,
  conversation: (publicationId: string, ideaId: string, conversationId: string) =>
    ['conversation', publicationId, ideaId, conversationId] as const,
  research: (publicationId: string, ideaId: string) => ['research', publicationId, ideaId] as const,
  recentPosts: (publicationId: string, days: number, feeds: string) =>
    ['recent-posts', publicationId, days, feeds] as const,
}

export type QueryRoot =
  | 'active-drafts'
  | 'attention'
  | 'comments'
  | 'critique'
  | 'conversation'
  | 'draft'
  | 'draft-handover'
  | 'devices'
  | 'drafts'
  | 'draft-reviewers'
  | 'review'
  | 'reviews'
  | 'draft-insertions'
  | 'idea'
  | 'idea-move-preview'
  | 'ideas'
  | 'invitation-blocks'
  | 'invitations'
  | 'me'
  | 'my-invitations'
  | 'notes'
  | 'publications'
  | 'articles'
  | 'recent-posts'
  | 'research'
  | 'sources'

/** Refreshes everything under each root. */
export const invalidateRoots = (queryClient: QueryClient, ...roots: QueryRoot[]) =>
  Promise.all(roots.map((root) => queryClient.invalidateQueries({ queryKey: [root] })))

/** Forgets everything under each root, without asking again until something wants it. */
export const removeRoots = (queryClient: QueryClient, ...roots: QueryRoot[]) =>
  roots.forEach((root) => queryClient.removeQueries({ queryKey: [root] }))

/** After a change to notes that may also have changed the idea or the drafts that use them. */
export const refreshNotesEverywhere = (queryClient: QueryClient) =>
  invalidateRoots(queryClient, 'notes', 'idea', 'ideas', 'draft-insertions')

/**
 * A change to an idea's notes or articles also changes the idea's "last changed" time and its text as
 * brainstorming sees it. The publication's own notes belong to no idea, so nothing else shows them.
 */
export const refreshIdea = (
  queryClient: QueryClient,
  publicationId: string,
  ideaId: string | null | undefined,
) =>
  ideaId
    ? Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.idea(publicationId, ideaId) }),
        queryClient.invalidateQueries({ queryKey: ['ideas'] }),
      ])
    : Promise.resolve([])

// The arguments are getters, so a query follows a component's props as they change.
type Get<T> = () => T

/** The models the provider offers this person's saved key; only asked for once there is a key. */
export function useLlmModels(enabled: Get<boolean>) {
  return useQuery({
    queryKey: queryKeys.llmModels(),
    queryFn: () => api.listLlmModels(),
    enabled,
    // The provider's list changes rarely, and each look is a call to their account.
    staleTime: 5 * 60_000,
  })
}

export function useIdea(publicationId: Get<string>, id: Get<string | undefined>) {
  return useQuery({
    queryKey: computed(() => queryKeys.idea(publicationId(), id())),
    queryFn: () => api.getIdea(publicationId(), id()!),
    enabled: () => !!id(),
  })
}

export function useIdeas(publicationId: Get<string>, enabled: Get<boolean> = () => true) {
  return useQuery({
    queryKey: computed(() => queryKeys.ideas(publicationId())),
    queryFn: () => api.listIdeas(publicationId()),
    enabled,
  })
}

export function useSources(publicationId: Get<string>, enabled: Get<boolean> = () => true) {
  return useQuery({
    queryKey: computed(() => queryKeys.sources(publicationId())),
    queryFn: () => api.listSources(publicationId()),
    enabled,
  })
}

export function useDraft(
  publicationId: Get<string>,
  id: Get<string>,
  enabled: Get<boolean> = () => true,
) {
  return useQuery({
    queryKey: computed(() => queryKeys.draft(publicationId(), id())),
    queryFn: () => api.getDraft(publicationId(), id()),
    enabled,
  })
}

/** What a component needs to know of a query to show its loading and error states (see `QueryState`). */
export interface QueryStatus {
  isPending: Ref<boolean>
  isError: Ref<boolean>
  error?: Ref<unknown>
  refetch: () => unknown
}

/** The latest critique's summary and how many critiques are used: the draft editor's alone (others get nothing). */
export function useDraftCritique(
  publicationId: Get<string>,
  draftId: Get<string>,
  enabled: Get<boolean>,
) {
  return useQuery({
    queryKey: computed(() => queryKeys.critique(publicationId(), draftId())),
    queryFn: () => api.latestCritique(publicationId(), draftId()),
    enabled,
  })
}

/** The comments on a draft that the signed-in person may see (the editor sees all of them; the others their own). */
export function useDraftComments(publicationId: Get<string>, draftId: Get<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.comments(publicationId(), draftId())),
    queryFn: () => api.listComments(publicationId(), draftId()),
  })
}

/** Adds the person's comment to the draft, then refreshes the list. */
export function useAddComment(publicationId: Get<string>, draftId: Get<string>) {
  const queryClient = useQueryClient()
  return async (input: CommentInput) => {
    await api.addComment(publicationId(), draftId(), input)
    await invalidateRoots(queryClient, 'comments')
  }
}

/** Rewords the person's own comment, then refreshes the list. */
export function useEditComment(publicationId: Get<string>, draftId: Get<string>) {
  const queryClient = useQueryClient()
  return async (commentId: string, text: string) => {
    await api.editComment(publicationId(), draftId(), commentId, { text })
    await invalidateRoots(queryClient, 'comments')
  }
}

/** Deletes the person's own comment for good, then refreshes what shows comments. */
export function useDeleteComment(publicationId: Get<string>, draftId: Get<string>) {
  const queryClient = useQueryClient()
  return async (commentId: string) => {
    await api.deleteComment(publicationId(), draftId(), commentId)
    await invalidateRoots(queryClient, 'comments', 'attention', 'draft-reviewers', 'active-drafts')
  }
}

/** A reviewer rewording or deleting their own comment on a review; both refresh the review and the reviews list. */
export function useReviewComments(reviewId: Get<string>) {
  const queryClient = useQueryClient()
  const refresh = () => invalidateRoots(queryClient, 'review', 'reviews')
  return {
    edit: async (commentId: string, text: string) => {
      await api.editReviewComment(reviewId(), commentId, { text })
      await refresh()
    },
    remove: async (commentId: string) => {
      await api.deleteReviewComment(reviewId(), commentId)
      await refresh()
    },
  }
}

/** The editor resolving a comment (or bringing it back): keeps the list the server answers with. */
export function useResolveComment(
  publicationId: Get<string>,
  draftId: Get<string>,
  onError: (err: unknown, commentId: string) => void,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: { commentId: string; resolved: boolean }) =>
      api.setCommentResolved(publicationId(), draftId(), v.commentId, v.resolved),
    onSuccess: (all) => {
      queryClient.setQueryData(queryKeys.comments(publicationId(), draftId()), all)
      // Resolving can clear what the landing page and the reviews summary say is waiting.
      void invalidateRoots(queryClient, 'attention', 'draft-reviewers', 'active-drafts')
    },
    onError: (err, v) => onError(err, v.commentId),
  })
}

/**
 * The editor marking the draft published, or taking the mark away (#311). Only the mark and the link change in the
 * cached draft, so the words being typed are left alone; the lists that show it are refreshed.
 */
export function useSetPublished(publicationId: Get<string>, draftId: Get<string>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: DraftPublishedInput) =>
      api.setDraftPublished(publicationId(), draftId(), input),
    onSuccess: (saved) => {
      queryClient.setQueryData(
        queryKeys.draft(publicationId(), draftId()),
        (old?: Draft) =>
          old && { ...old, publishedAt: saved.publishedAt, publishedUrl: saved.publishedUrl },
      )
      void invalidateRoots(queryClient, 'idea', 'ideas', 'active-drafts')
    },
  })
}

/** An idea's notes, or (`ideaId` null) the publication's own, with the ways the cache is changed without asking again. */
export function useIdeaNotes(
  publicationId: Get<string>,
  ideaId: Get<string | null | undefined>,
  enabled: Get<boolean> = () => true,
) {
  const queryClient = useQueryClient()
  const notes = useQuery({
    queryKey: computed(() => queryKeys.notes(publicationId(), ideaId())),
    queryFn: () => api.listIdeaNotes(publicationId(), ideaId() ?? null),
    enabled,
  })
  const key = () => queryKeys.notes(publicationId(), ideaId())
  /** Keeps what the server answered (or the notes as the change left them). */
  const set = (all: IdeaNote[] | ((old: IdeaNote[] | undefined) => IdeaNote[] | undefined)) =>
    queryClient.setQueryData<IdeaNote[]>(key(), all)
  const append = (note: IdeaNote) => set((old) => [...(old ?? []), note])
  const prepend = (note: IdeaNote) => set((old) => [note, ...(old ?? [])])
  return {
    notes,
    set,
    append,
    prepend,
    refreshIdea: () => refreshIdea(queryClient, publicationId(), ideaId()),
  }
}

/**
 * The drafts the person edits that are active, `limit` of them (Keep writing, #310). The list on screen stays while a
 * longer one is fetched, so "Show more" adds rows below instead of blanking the box.
 */
export function useActiveDrafts(
  scope: Get<ActiveScope> = () => ({}),
  limit: Get<number> = () => ACTIVE_DRAFTS_PAGE,
  enabled: Get<boolean> = () => true,
) {
  return useQuery({
    queryKey: computed(() => queryKeys.activeDrafts(scope(), limit())),
    queryFn: () => api.listActiveDrafts(scope(), limit()),
    placeholderData: keepPreviousData,
    enabled,
  })
}
