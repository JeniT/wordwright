<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import { MAX_REVIEW_NAME, type ReviewState } from '@wordwright/core'
import { api, errorMessage } from '../lib/api'
import { useInlineEdit } from '../lib/inline-edit'
import { queryKeys } from '../lib/queries'
import { useHandover, useReviewers } from '../lib/draft-people'
import { vTip } from '../lib/tip'
import { reviewDateTime, reviewSummary, reviewTitle } from '../lib/review-request'
import ConfirmDialog from './ConfirmDialog.vue'
import Icon from './Icon.vue'
import PageNav from './PageNav.vue'
import QueryState from './QueryState.vue'
import RowList from './RowList.vue'
import SaveStatus from './SaveStatus.vue'
import SendForReviewDialog from './SendForReviewDialog.vue'

/**
 * Who is reviewing the draft and how far they have got: the Reviews tab beside the draft, for the editor and the
 * publication's owners. One review request at a time (CONTEXT.md: a snapshot sent for review, with its reviewers),
 * the latest first, with Previous review and Next review to go back. Sending (`SendForReviewDialog`) starts here, at the
 * top, for the editor only: an owner who is not the editor can read and close reviews but not send.
 */
const props = defineProps<{
  publicationId: string
  draftId: string
  /** Saves the editor's unsaved words first; rejects (with why) if it can't. */
  prepare?: () => Promise<unknown>
}>()
const { isEditor } = useHandover(
  () => props.publicationId,
  () => props.draftId,
)
const sending = ref(false)
const queryClient = useQueryClient()
const list = useReviewers(
  () => props.publicationId,
  () => props.draftId,
  () => true,
)
const refresh = () =>
  queryClient.invalidateQueries({
    queryKey: queryKeys.reviewers(props.publicationId, props.draftId),
  })

// ---- which request is shown: the latest, until the person goes back
const requests = computed(() => list.data.value?.snapshots ?? [])
const chosen = ref<string | null>(null)
const position = computed(() => {
  const at = requests.value.findIndex((r) => r.id === chosen.value)
  return at === -1 ? requests.value.length - 1 : at
})
const current = computed(() => requests.value[position.value])
function go(step: -1 | 1) {
  chosen.value = requests.value[position.value + step]?.id ?? null
}
// A request just sent is the one to look at.
watch(
  () => requests.value.length,
  (now, before) => {
    if (before !== undefined && now > before) chosen.value = null
  },
)
const nav = computed(() => ({
  page: position.value + 1,
  pageCount: requests.value.length,
  first: position.value + 1,
  last: position.value + 1,
  total: requests.value.length,
  noun: 'review',
  size: 1,
  single: true,
  previousLabel: 'Previous review',
  nextLabel: 'Next review',
}))

const title = computed(() => (current.value ? reviewTitle(current.value) : ''))
const summary = computed(() => (current.value ? reviewSummary(current.value) : ''))
const reviewers = computed(() =>
  (list.data.value?.reviewers ?? []).filter((r) => r.snapshotId === current.value?.id),
)
const invitations = computed(() =>
  (list.data.value?.pending ?? []).filter((p) => p.snapshotId === current.value?.id),
)
const openHere = computed(() => current.value?.open ?? 0)
const openElsewhere = computed(
  () => requests.value.reduce((n, r) => n + r.open, 0) - openHere.value,
)

// ---- renaming it
const nameDraft = ref('')
const nameField = ref<HTMLInputElement>()
const renameButton = ref<HTMLButtonElement>()
const nameEdit = useInlineEdit<'name'>({
  field: () => nameField.value,
  trigger: () => renameButton.value,
})
function startRenaming() {
  nameDraft.value = current.value?.name ?? ''
  void nameEdit.start('name')
}
const rename = useMutation({
  mutationFn: (name: string) =>
    api.renameReviewRequest(props.publicationId, props.draftId, current.value!.id, name),
  onSuccess: async () => {
    await refresh()
    void nameEdit.stop()
  },
})
function saveName() {
  const name = nameDraft.value.trim()
  if (name === (current.value?.name ?? '')) return void nameEdit.stop()
  rename.mutate(name)
}
function cancelRenaming() {
  rename.reset()
  void nameEdit.stop()
}

// ---- closing: always asked first, since a closed review can't be reopened
type Closing = { kind: 'one'; id: string; name: string } | { kind: 'these' } | { kind: 'all' }
const closing = ref<Closing | null>(null)
const closeOne = useMutation({
  mutationFn: (id: string) => api.closeReview(props.publicationId, props.draftId, id),
  onSuccess: refresh,
})
const closeThese = useMutation({
  mutationFn: () => api.closeReviewRequest(props.publicationId, props.draftId, current.value!.id),
  onSuccess: refresh,
})
const closeAll = useMutation({
  mutationFn: () => api.closeAllReviews(props.publicationId, props.draftId),
  onSuccess: refresh,
})
const confirmClose = () => {
  const what = closing.value
  closing.value = null
  if (what?.kind === 'one') closeOne.mutate(what.id)
  else if (what?.kind === 'these') closeThese.mutate()
  else if (what?.kind === 'all') closeAll.mutate()
}
const closeTitle = computed(() =>
  closing.value?.kind === 'one'
    ? `Close ${closing.value.name}’s review?`
    : closing.value?.kind === 'these'
      ? 'Close these reviews?'
      : 'Close all reviews?',
)
const closeLabel = computed(() =>
  closing.value?.kind === 'one'
    ? 'Close review'
    : closing.value?.kind === 'these'
      ? 'Close these reviews'
      : 'Close all reviews',
)

const withdraw = useMutation({
  mutationFn: (id: string) => api.withdrawReviewInvitation(props.publicationId, props.draftId, id),
  onSuccess: refresh,
})
const problem = computed(() => {
  const failed = [closeOne, closeThese, closeAll, withdraw].find((m) => m.isError.value)
  return failed ? errorMessage(failed.error.value) : ''
})
const stateLabel: Record<ReviewState, string> = {
  open: 'Reading',
  ended: 'Finished',
  closed: 'Closed',
}
</script>

<template>
  <section aria-labelledby="reviews-heading" class="text-sm">
    <!-- The tab beside the draft already says "Reviews"; the heading is for screen readers moving by headings. -->
    <h2 id="reviews-heading" class="sr-only">Reviews</h2>
    <div v-if="isEditor" class="mb-3">
      <button type="button" class="btn btn-outline btn-sm" @click="sending = true">
        Send for review
      </button>
    </div>
    <p v-if="problem" role="alert" class="mb-3 text-danger">{{ problem }}</p>
    <QueryState :query="list" what="who is reviewing">
      <p v-if="!current" class="text-ink-soft" data-testid="no-reviews">
        {{
          isEditor
            ? 'Nobody is reviewing yet. Sending for review shares a snapshot of this draft, so reviewers read and comment on it as it is now, not on later edits.'
            : 'Nobody is reviewing yet. Only the draft’s editor can send it for review.'
        }}
      </p>
      <template v-if="current">
        <PageNav
          v-if="requests.length > 1"
          v-bind="nav"
          small
          label="Reviews"
          announce
          class="mb-3"
          @go="go"
        />
        <div class="mb-3">
          <div class="mb-1 flex items-start gap-2">
            <h3 class="min-w-0 flex-1 break-words font-display text-base font-semibold">
              <form
                v-if="nameEdit.editing.value"
                class="flex flex-wrap items-center gap-2"
                @submit.prevent="saveName"
                @keydown.escape="cancelRenaming"
              >
                <input
                  ref="nameField"
                  v-model="nameDraft"
                  type="text"
                  :maxlength="MAX_REVIEW_NAME"
                  class="field min-w-0 flex-1 basis-40"
                  aria-label="Review name"
                />
                <button
                  type="submit"
                  class="btn btn-sm btn-primary"
                  :disabled="rename.isPending.value"
                >
                  Save
                </button>
                <button type="button" class="btn btn-sm btn-neutral" @click="cancelRenaming">
                  Cancel
                </button>
              </form>
              <template v-else>{{ title }}</template>
            </h3>
            <button
              v-if="!nameEdit.editing.value"
              ref="renameButton"
              v-tip="'Rename review'"
              type="button"
              class="btn btn-sm btn-icon btn-ghost shrink-0"
              aria-label="Rename review"
              @click="startRenaming"
            >
              <Icon name="edit" />
            </button>
          </div>
          <p v-if="current.name" class="mb-1 text-ink-soft">
            Sent {{ reviewDateTime(current.sentAt) }}
          </p>
          <SaveStatus :mutation="rename" saved="" />
          <p class="text-ink-soft" data-testid="review-summary">{{ summary }}</p>
        </div>
        <RowList v-if="reviewers.length" :items="reviewers" label="Reviewers" class="mb-3">
          <template #default="{ item: r }">
            <span class="min-w-0 flex-1">
              <strong>{{ r.name }}</strong> · {{ stateLabel[r.state] }} · {{ r.commentCount }}
              {{ r.commentCount === 1 ? 'comment' : 'comments' }}
            </span>
          </template>
          <template #actions="{ item: r }">
            <button
              v-if="r.state === 'open'"
              type="button"
              class="btn btn-sm btn-neutral"
              :aria-label="`Close review: ${r.name}`"
              @click="closing = { kind: 'one', id: r.id, name: r.name }"
            >
              Close review
            </button>
          </template>
        </RowList>
        <RowList
          v-if="invitations.length"
          :items="invitations"
          label="Invitations waiting"
          class="mb-3"
        >
          <template #default="{ item: p }">
            <span class="min-w-0 flex-1">{{ p.email }} · waiting for a reply</span>
          </template>
          <template #actions="{ item: p }">
            <button
              type="button"
              class="btn btn-sm btn-neutral"
              :disabled="withdraw.isPending.value"
              :aria-label="`Withdraw the invitation to ${p.email}`"
              @click="withdraw.mutate(p.id)"
            >
              Withdraw
            </button>
          </template>
        </RowList>
        <div class="flex flex-wrap gap-2">
          <button
            v-if="openHere"
            type="button"
            class="btn btn-sm btn-neutral"
            @click="closing = { kind: 'these' }"
          >
            Close these reviews
          </button>
          <button
            v-if="openElsewhere > 0"
            type="button"
            class="btn btn-sm btn-neutral"
            @click="closing = { kind: 'all' }"
          >
            Close all reviews
          </button>
        </div>
      </template>
    </QueryState>

    <SendForReviewDialog
      :open="sending"
      :publication-id="publicationId"
      :draft-id="draftId"
      :prepare="prepare"
      @close="sending = false"
    />
    <ConfirmDialog
      :open="!!closing"
      :title="closeTitle"
      :confirm-label="closeLabel"
      @confirm="confirmClose"
      @cancel="closing = null"
    >
      <template v-if="closing?.kind === 'one'">
        {{ closing.name }} will no longer be able to add comments. This cannot be undone.
      </template>
      <template v-else>
        Reviewers will no longer be able to add comments. This cannot be undone.
      </template>
    </ConfirmDialog>
  </section>
</template>
