<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { api, errorMessage } from '../lib/api'
import { invalidateRoots, queryKeys } from '../lib/queries'

/**
 * What is waiting on this person in the publication, said once at the top of its landing page and nowhere else (#159):
 * a draft offered to them (Accept or Decline here, or open the draft) and their own offer still waiting for an answer
 * (Withdraw). How the reviews they sent stand is Keep writing's (#310). There is no email for any of it, no count in
 * the menu, and nothing when nothing waits.
 */
const props = defineProps<{ publicationId: string }>()
const queryClient = useQueryClient()
const attention = useQuery({
  queryKey: computed(() => queryKeys.attention(props.publicationId)),
  queryFn: () => api.getPublicationAttention(props.publicationId),
})
const done = () =>
  invalidateRoots(queryClient, 'attention', 'draft', 'draft-handover', 'active-drafts')
const accept = useMutation({
  mutationFn: (draftId: string) => api.acceptOffer(props.publicationId, draftId),
  onSuccess: done,
})
const decline = useMutation({
  mutationFn: (draftId: string) => api.declineOffer(props.publicationId, draftId),
  onSuccess: done,
})
const withdraw = useMutation({
  mutationFn: (draftId: string) => api.withdrawOffer(props.publicationId, draftId),
  onSuccess: done,
})
const problem = computed(() => {
  const failed = [accept, decline, withdraw].find((m) => m.isError.value)
  return failed ? errorMessage(failed.error.value) : ''
})
const busy = computed(() => [accept, decline, withdraw].some((m) => m.isPending.value))
const any = computed(() => {
  const a = attention.data.value
  return !!a && (a.offered.length > 0 || a.waiting.length > 0)
})
</script>

<template>
  <section v-if="any" class="mb-8 space-y-3" aria-labelledby="attention-heading">
    <h2 id="attention-heading" class="sr-only">Waiting for you</h2>

    <div v-for="o in attention.data.value?.offered" :key="`o-${o.draftId}`" class="callout">
      <p class="mb-2">
        <strong>{{ o.fromName ?? 'Someone' }}</strong> has offered you the draft
        <RouterLink
          :to="{ name: 'draft', params: { publicationId, id: o.draftId } }"
          class="link"
          >{{ o.title || 'Untitled draft' }}</RouterLink
        >. If you accept, you become its editor, the only person who can change its words.
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
        <RouterLink
          :to="{ name: 'draft', params: { publicationId, id: w.draftId } }"
          class="link"
          >{{ w.title || 'Untitled draft' }}</RouterLink
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

    <p v-if="problem" role="alert" class="text-danger">{{ problem }}</p>
  </section>
</template>
