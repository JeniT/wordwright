<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, useId } from 'vue'
import { RouterLink } from 'vue-router'
import type { Idea, Proposal } from '@lfwa/core'
import { api, errorMessage } from '../lib/api'
import DiffView from './DiffView.vue'

const props = defineProps<{
  profileId: string
  ideaId: string
  proposal: Proposal
  /** The idea as it is now, so a suggestion can be shown against what it would replace. */
  idea?: Idea
}>()

const queryClient = useQueryClient()
const headingId = useId()
const pending = computed(() => props.proposal.status === 'pending')
const name = computed(() => props.proposal.input.name)
const notes = computed(() => props.proposal.input.notes)

// What the suggestion is, for the buttons' names (there may be several cards on the page).
const what = computed(() => {
  if (props.proposal.tool === 'create_idea') return `a new idea, “${props.proposal.input.name}”`
  const parts = [
    name.value !== undefined && 'a new title',
    notes.value !== undefined && 'new notes',
  ]
  return parts.filter(Boolean).join(' and ')
})

// Whatever happens, the thread and the idea may have changed (someone else may have decided it first).
const refresh = () =>
  Promise.all(
    ['conversation', 'idea', 'ideas'].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    ),
  )
const accept = useMutation({
  mutationFn: () =>
    api.acceptProposal(props.profileId, props.ideaId, props.proposal.id, props.proposal.stale),
  onSettled: refresh,
})
const dismiss = useMutation({
  mutationFn: () => api.dismissProposal(props.profileId, props.ideaId, props.proposal.id),
  onSettled: refresh,
})
const busy = computed(() => accept.isPending.value || dismiss.isPending.value)
</script>

<template>
  <section
    :aria-labelledby="headingId"
    class="mt-3 rounded border border-stone-300 bg-stone-50 p-4"
  >
    <h2 :id="headingId" class="mb-2 font-serif text-lg font-semibold">
      {{ proposal.tool === 'create_idea' ? 'Suggested new idea' : 'Suggested change to this idea' }}
    </h2>

    <template v-if="proposal.tool === 'update_idea'">
      <div v-if="name !== undefined" class="mb-3">
        <p class="text-sm font-medium">Title</p>
        <p v-if="pending && idea" class="text-sm text-stone-600">
          Now: <span class="line-through decoration-stone-400">{{ idea.name }}</span>
          <span class="sr-only">(would be replaced)</span>
        </p>
        <p><span v-if="pending" class="text-sm text-stone-600">Suggested: </span>{{ name }}</p>
      </div>
      <div v-if="notes !== undefined" class="mb-3">
        <p class="mb-1 text-sm font-medium">Notes</p>
        <DiffView v-if="pending && idea" :before="idea.notes" :after="notes" />
        <details v-else>
          <summary class="cursor-pointer text-sm underline">Show the suggested notes</summary>
          <p class="mt-2 whitespace-pre-wrap text-sm">{{ notes }}</p>
        </details>
      </div>
    </template>
    <template v-else>
      <p class="mb-1 font-medium">{{ name }}</p>
      <p v-if="notes" class="mb-3 whitespace-pre-wrap text-sm">{{ notes }}</p>
      <p v-else class="mb-3 text-sm text-stone-600">No notes yet.</p>
    </template>

    <template v-if="pending">
      <p
        v-if="proposal.stale"
        role="status"
        class="mb-3 rounded bg-amber-50 p-2 text-sm text-amber-900"
      >
        The idea has changed since this was suggested. The comparison above shows what is there now;
        accepting will replace it.
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn btn-sm btn-primary"
          :aria-label="`${proposal.stale ? 'Apply anyway' : 'Accept'}: ${what}`"
          :disabled="busy"
          @click="accept.mutate()"
        >
          {{ accept.isPending.value ? 'Applying…' : proposal.stale ? 'Apply anyway' : 'Accept' }}
        </button>
        <button
          type="button"
          class="btn btn-sm btn-neutral"
          :aria-label="`Dismiss: ${what}`"
          :disabled="busy"
          @click="dismiss.mutate()"
        >
          Dismiss
        </button>
      </div>
      <p
        v-if="accept.isError.value || dismiss.isError.value"
        role="alert"
        class="mt-2 text-sm text-red-700"
      >
        {{ errorMessage(accept.error.value ?? dismiss.error.value) }}
      </p>
    </template>
    <p v-else-if="proposal.status === 'accepted'" class="text-sm text-stone-700">
      Accepted{{ proposal.decidedByName ? ` by ${proposal.decidedByName}` : '' }}.
      <RouterLink
        v-if="proposal.createdIdeaId"
        :to="{ name: 'idea', params: { profileId, id: proposal.createdIdeaId } }"
        class="underline"
      >
        Open the new idea
      </RouterLink>
    </p>
    <p v-else class="text-sm text-stone-700">
      Dismissed{{ proposal.decidedByName ? ` by ${proposal.decidedByName}` : '' }}.
    </p>
  </section>
</template>
