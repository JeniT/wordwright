import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import type { HandoverState } from '@wordwright/core'
import { api, errorMessage } from './api'
import { invalidateRoots, queryKeys } from './queries'
import { usePublication } from './usePublications'
import { useSessionStore } from '../stores/session'

/**
 * Who has the pen on a draft and who is reviewing it (CONTEXT.md, "Handover" and "Review"), for the notices, the
 * buttons and the dialogs that share them. Queries are shared by key, so each caller reads the same data.
 */
export function useHandover(publicationId: () => string, draftId: () => string) {
  const session = useSessionStore()
  const { publication } = usePublication(publicationId)
  const handover = useQuery({
    queryKey: computed(() => queryKeys.handover(publicationId(), draftId())),
    queryFn: () => api.getHandover(publicationId(), draftId()),
  })
  const me = computed(() => session.user?.id)
  const isEditor = computed(() => handover.data.value?.editorId === me.value)
  const isOwner = computed(() => publication.value?.role === 'owner')
  /** Members who are not the editor: who a draft can be offered to or reassigned to. */
  const others = computed(() =>
    (publication.value?.members ?? []).filter((m) => m.userId !== handover.data.value?.editorId),
  )
  const offeredToMe = computed(() => handover.data.value?.offer?.toId === me.value)
  const myAsk = computed(() => handover.data.value?.asks.find((a) => a.byId === me.value))
  return { handover, isEditor, isOwner, others, offeredToMe, myAsk }
}

/** Every handover action answers with the handover as it now is; a change of editor also changes what the page may do. */
export function useHandoverActions(
  publicationId: () => string,
  draftId: () => string,
  /** Saves the editor's unsaved words first, so a hand-off never leaves them behind; rejects (with why) if it can't. */
  prepare?: () => Promise<unknown>,
) {
  const queryClient = useQueryClient()
  function settle(state: HandoverState) {
    queryClient.setQueryData(queryKeys.handover(publicationId(), draftId()), state)
    void invalidateRoots(queryClient, 'draft', 'critique', 'attention', 'active-drafts')
  }
  const run = <A>(fn: (arg: A) => Promise<HandoverState>) =>
    useMutation({ mutationFn: fn, onSuccess: settle })
  const offer = run(async (userId: string) => {
    await prepare?.()
    return api.offerDraft(publicationId(), draftId(), userId)
  })
  const withdraw = run(() => api.withdrawOffer(publicationId(), draftId()))
  const accept = run(() => api.acceptOffer(publicationId(), draftId()))
  const decline = run(() => api.declineOffer(publicationId(), draftId()))
  const ask = run(() => api.askForDraft(publicationId(), draftId()))
  const closeAsk = run((askId: string) => api.closeAsk(publicationId(), draftId(), askId))
  const reassign = run(async (userId: string) => {
    await prepare?.()
    return api.reassignDraft(publicationId(), draftId(), userId)
  })
  const all = [offer, withdraw, accept, decline, ask, closeAsk, reassign]
  const problem = computed(() => {
    const failed = all.find((m) => m.isError.value)
    return failed ? errorMessage(failed.error.value) : ''
  })
  const busy = computed(() => all.some((m) => m.isPending.value))
  return { offer, withdraw, accept, decline, ask, closeAsk, reassign, problem, busy }
}

/** Who is reviewing the draft: only its editor and the publication's owners may see this. */
export function useReviewers(
  publicationId: () => string,
  draftId: () => string,
  enabled: () => boolean,
) {
  return useQuery({
    queryKey: computed(() => queryKeys.reviewers(publicationId(), draftId())),
    queryFn: () => api.listReviewers(publicationId(), draftId()),
    enabled,
    // Comments appear for the editor as they are made.
    refetchInterval: 30_000,
  })
}
