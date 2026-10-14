<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { SnapshotReviews } from '@lfwa/core'
import { api, errorMessage } from '../lib/api'
import { invalidateRoots, queryKeys } from '../lib/queries'

/**
 * What is waiting on this person in the profile, said once at the top of its landing page and nowhere else (#159):
 * a draft offered to them (Accept or Decline here, or open the draft), their own offer still waiting for an answer
 * (Withdraw), and, for drafts they edit, how the reviews they sent stand, with a flag when every review is over and
 * comments are still unanswered. There is no email for any of it, no count in the menu, and nothing when nothing waits.
 */
const props = defineProps<{ profileId: string }>()
const queryClient = useQueryClient()
const attention = useQuery({
  queryKey: computed(() => queryKeys.attention(props.profileId)),
  queryFn: () => api.getProfileAttention(props.profileId),
})
const done = () => invalidateRoots(queryClient, 'attention', 'draft', 'draft-handover')
const accept = useMutation({
  mutationFn: (draftId: string) => api.acceptOffer(props.profileId, draftId),
  onSuccess: done,
})
const decline = useMutation({
  mutationFn: (draftId: string) => api.declineOffer(props.profileId, draftId),
  onSuccess: done,
})
const withdraw = useMutation({
  mutationFn: (draftId: string) => api.withdrawOffer(props.profileId, draftId),
  onSuccess: done,
})
const problem = computed(() => {
  const failed = [accept, decline, withdraw].find((m) => m.isError.value)
  return failed ? errorMessage(failed.error.value) : ''
})
const busy = computed(() => [accept, decline, withdraw].some((m) => m.isPending.value))
const any = computed(() => {
  const a = attention.data.value
  return !!a && (a.offered.length > 0 || a.waiting.length > 0 || a.reviews.length > 0)
})
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
const line = (s: SnapshotReviews) => {
  const parts = [
    s.open ? `${s.open} reading` : '',
    s.ended ? `${s.ended} finished` : '',
    s.closed ? `${s.closed} closed` : '',
    s.unresolved ? `${s.unresolved} ${s.unresolved === 1 ? 'comment' : 'comments'} to answer` : '',
  ].filter(Boolean)
  return `Sent ${when(s.sentAt)}: ${parts.join(', ')}`
}
</script>

<template>
  <section v-if="any" class="mb-8 space-y-3" aria-labelledby="attention-heading">
    <h2 id="attention-heading" class="sr-only">Waiting for you</h2>

    <div v-for="o in attention.data.value?.offered" :key="`o-${o.draftId}`" class="callout">
      <p class="mb-2">
        <strong>{{ o.fromName ?? 'Someone' }}</strong> has offered you the draft
        <RouterLink :to="{ name: 'draft', params: { profileId, id: o.draftId } }" class="link">{{
          o.title || 'Untitled draft'
        }}</RouterLink
        >. If you accept, you become its editor.
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="busy"
          :aria-label="`Accept ${o.title || 'the draft'}`"
          @click="accept.mutate(o.draftId)"
        >
          Accept
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline"
          :disabled="busy"
          :aria-label="`Decline ${o.title || 'the draft'}`"
          @click="decline.mutate(o.draftId)"
        >
          Decline
        </button>
      </div>
    </div>

    <div
      v-for="w in attention.data.value?.waiting"
      :key="`w-${w.draftId}`"
      class="callout flex flex-wrap items-center gap-x-3 gap-y-2"
    >
      <p>
        Waiting for <strong>{{ w.toName ?? 'a former member' }}</strong> to answer your offer of
        <RouterLink :to="{ name: 'draft', params: { profileId, id: w.draftId } }" class="link">{{
          w.title || 'Untitled draft'
        }}</RouterLink
        >. You stay its editor until they accept.
      </p>
      <button
        type="button"
        class="btn btn-sm btn-neutral"
        :disabled="busy"
        :aria-label="`Withdraw the offer of ${w.title || 'the draft'}`"
        @click="withdraw.mutate(w.draftId)"
      >
        Withdraw
      </button>
    </div>

    <div v-if="attention.data.value?.reviews.length" class="panel p-4">
      <h3 class="mb-2 font-semibold">Reviews you sent</h3>
      <ul class="space-y-3" aria-label="Drafts sent for review">
        <li v-for="r in attention.data.value.reviews" :key="r.draftId">
          <p>
            <RouterLink
              :to="{ name: 'draft', params: { profileId, id: r.draftId } }"
              class="link font-semibold"
              >{{ r.title || 'Untitled draft' }}</RouterLink
            >
            <span v-if="r.needsAttention" class="chip chip-quiet ml-2"
              >Reviews finished, comments to answer</span
            >
          </p>
          <ul class="meta">
            <li v-for="s in r.snapshots" :key="s.id">{{ line(s) }}</li>
          </ul>
        </li>
      </ul>
    </div>

    <p v-if="problem" role="alert" class="text-danger">{{ problem }}</p>
  </section>
</template>
