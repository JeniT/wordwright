<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import type { ReviewState } from '@wordwright/core'
import { api, errorMessage } from '../lib/api'
import { queryKeys } from '../lib/queries'
import { usePublication } from '../lib/usePublications'
import { useSessionStore } from '../stores/session'
import QueryState from './QueryState.vue'

/**
 * Sending the draft for review. The draft's title and body are frozen as a snapshot, and the people asked (by email, or
 * members of the publication) read and comment on that, not on later edits (ADR 0001). Only the editor sends; the editor
 * and owners see who is reviewing, how far they have got, and can stop accepting reviews. Others don't see this.
 */
const props = defineProps<{ publicationId: string; draftId: string; editorId: string }>()
const queryClient = useQueryClient()
const session = useSessionStore()
const { publication } = usePublication(() => props.publicationId)
const isEditor = computed(() => session.user?.id === props.editorId)
const mayManage = computed(() => isEditor.value || publication.value?.role === 'owner')
const others = computed(() =>
  (publication.value?.members ?? []).filter((m) => m.userId !== props.editorId),
)

const list = useQuery({
  queryKey: computed(() => queryKeys.reviewers(props.publicationId, props.draftId)),
  queryFn: () => api.listReviewers(props.publicationId, props.draftId),
  enabled: mayManage,
  // Comments appear for the editor as they are made.
  refetchInterval: 30_000,
})
const refresh = () =>
  queryClient.invalidateQueries({
    queryKey: queryKeys.reviewers(props.publicationId, props.draftId),
  })

const emails = ref('')
const chosen = ref<string[]>([])
const sentSummary = ref('')
const addresses = computed(() => [...new Set(emails.value.split(/[\s,;]+/).filter(Boolean))])
const send = useMutation({
  mutationFn: () =>
    api.sendForReview(props.publicationId, props.draftId, {
      emails: addresses.value,
      memberIds: chosen.value,
    }),
  onSuccess: async () => {
    const n = addresses.value.length + chosen.value.length
    sentSummary.value = `Sent a snapshot of the draft as it is now to ${n} ${n === 1 ? 'person' : 'people'}.`
    emails.value = ''
    chosen.value = []
    await refresh()
  },
})
const close = useMutation({
  mutationFn: (id: string) => api.closeReview(props.publicationId, props.draftId, id),
  onSuccess: refresh,
})
const closeAll = useMutation({
  mutationFn: () => api.closeAllReviews(props.publicationId, props.draftId),
  onSuccess: refresh,
})
const withdraw = useMutation({
  mutationFn: (id: string) => api.withdrawReviewInvitation(props.publicationId, props.draftId, id),
  onSuccess: refresh,
})
const problem = computed(() => {
  const failed = [send, close, closeAll, withdraw].find((m) => m.isError.value)
  return failed ? errorMessage(failed.error.value) : ''
})
const stateLabel: Record<ReviewState, string> = {
  open: 'Reading',
  ended: 'Finished',
  closed: 'Closed by you',
}
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
const anyOpen = computed(() => list.data.value?.reviewers.some((r) => r.state === 'open') ?? false)
</script>

<template>
  <details v-if="mayManage" class="mb-6 text-sm">
    <summary class="cursor-pointer text-ink-soft">
      Send this draft for review<template v-if="list.data.value?.reviewers.length">
        ({{ list.data.value.reviewers.length }})</template
      >
    </summary>
    <div class="mt-3">
      <form v-if="isEditor" @submit.prevent="send.mutate()">
        <p class="callout mb-3" data-testid="snapshot-notice">
          The people you ask read a <strong>frozen copy</strong> of the draft as it is now, not what
          you write after this. Sending again makes a new copy. They can comment, and only you see
          their comments. The AI never receives them.
        </p>
        <div class="mb-3">
          <label for="review-emails" class="mb-1 block font-medium">Email addresses</label>
          <textarea
            id="review-emails"
            v-model="emails"
            rows="2"
            class="field"
            autocomplete="off"
            placeholder="One or more, separated by commas or new lines"
          ></textarea>
          <p class="mt-1 text-ink-soft">
            They get a link and an account that reaches only this copy of the draft.
          </p>
        </div>
        <fieldset v-if="others.length" class="mb-3">
          <legend class="mb-1 font-medium">Members of this publication</legend>
          <label v-for="m in others" :key="m.userId" class="mb-1 flex items-center gap-2">
            <input
              v-model="chosen"
              type="checkbox"
              :value="m.userId"
              class="size-4 accent-accent"
            />
            {{ m.name }}
          </label>
        </fieldset>
        <button
          type="submit"
          class="btn btn-outline"
          :disabled="send.isPending.value || (!addresses.length && !chosen.length)"
        >
          Send for review
        </button>
        <p v-if="sentSummary" role="status" class="mt-3">{{ sentSummary }}</p>
      </form>
      <p v-else class="mb-3 text-ink-soft">
        Only the draft's editor can send it for review. You can see who is reviewing, and stop
        accepting reviews.
      </p>
      <p v-if="problem" role="alert" class="mb-3 text-danger">{{ problem }}</p>

      <QueryState :query="list" what="who is reviewing">
        <ul
          v-if="list.data.value?.snapshots.length"
          class="mb-3 space-y-1 text-ink-soft"
          aria-label="Copies sent for review"
        >
          <li v-for="s in list.data.value.snapshots" :key="s.id" data-testid="snapshot-line">
            Copy sent {{ when(s.sentAt) }}: {{ s.open }} reading, {{ s.ended }} finished<template
              v-if="s.closed"
              >, {{ s.closed }} closed</template
            >, {{ s.unresolved }} {{ s.unresolved === 1 ? 'comment' : 'comments' }} to answer
          </li>
        </ul>
        <ul v-if="list.data.value?.reviewers.length" class="mb-3 space-y-2" aria-label="Reviewers">
          <li
            v-for="r in list.data.value.reviewers"
            :key="r.id"
            class="flex flex-wrap items-center gap-x-3 gap-y-1"
          >
            <span>
              <strong>{{ r.name }}</strong> · {{ stateLabel[r.state] }} · {{ r.commentCount }}
              {{ r.commentCount === 1 ? 'comment' : 'comments' }} · sent
              {{ when(r.sentAt) }}
            </span>
            <button
              v-if="r.state === 'open'"
              type="button"
              class="btn btn-sm btn-neutral"
              :disabled="close.isPending.value"
              :aria-label="`Stop accepting ${r.name}'s review`"
              @click="close.mutate(r.id)"
            >
              Close review
            </button>
          </li>
        </ul>
        <button
          v-if="anyOpen"
          type="button"
          class="btn btn-sm btn-neutral mb-3"
          :disabled="closeAll.isPending.value"
          @click="closeAll.mutate()"
        >
          Stop accepting reviews
        </button>
        <ul
          v-if="list.data.value?.pending.length"
          class="space-y-2"
          aria-label="Invitations waiting"
        >
          <li
            v-for="p in list.data.value.pending"
            :key="p.id"
            class="flex flex-wrap items-center gap-x-3 gap-y-1"
          >
            <span>{{ p.email }} · waiting for a reply</span>
            <button
              type="button"
              class="btn btn-sm btn-neutral"
              :disabled="withdraw.isPending.value"
              :aria-label="`Withdraw the invitation to ${p.email}`"
              @click="withdraw.mutate(p.id)"
            >
              Withdraw
            </button>
          </li>
        </ul>
      </QueryState>
    </div>
  </details>
</template>
