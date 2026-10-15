<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, useId } from 'vue'
import { RouterLink } from 'vue-router'
import type { Idea, Proposal } from '@wordwright/core'
import { api, errorMessage } from '../lib/api'
import { invalidateRoots } from '../lib/queries'

const props = defineProps<{
  publicationId: string
  ideaId: string
  proposal: Proposal
  /** The idea as it is now, so a suggestion can be shown against what it would replace. */
  idea?: Idea
}>()

const queryClient = useQueryClient()
const headingId = useId()
const pending = computed(() => props.proposal.status === 'pending')
const name = computed(() => props.proposal.input.name)
const reading = computed(() => props.proposal.reading)
/** A page that doesn't exist, or isn't public, can only be dismissed. */
const unusable = computed(
  () => reading.value?.check === 'not-found' || reading.value?.check === 'not-public',
)
const suggestedTitle = computed(() => props.proposal.input.title?.trim() ?? '')
const address = computed(() => props.proposal.input.url ?? '')

// What the suggestion is, for the buttons' names (there may be several cards on the page).
const what = computed(() => {
  if (props.proposal.tool === 'suggest_reading') {
    return `a page for the reading list, “${reading.value?.fetchedTitle || suggestedTitle.value || address.value}”`
  }
  if (props.proposal.tool === 'create_idea') return `a new idea, “${props.proposal.input.name}”`
  return 'a new title'
})

// Whatever happens, the thread and the idea may have changed (someone else may have decided it first).
const refresh = () => invalidateRoots(queryClient, 'conversation', 'idea', 'ideas')
const accept = useMutation({
  mutationFn: () =>
    api.acceptProposal(props.publicationId, props.ideaId, props.proposal.id, props.proposal.stale),
  onSettled: refresh,
})
const dismiss = useMutation({
  mutationFn: () => api.dismissProposal(props.publicationId, props.ideaId, props.proposal.id),
  onSettled: refresh,
})
const busy = computed(() => accept.isPending.value || dismiss.isPending.value)
</script>

<template>
  <section :aria-labelledby="headingId" class="mt-3 panel-sunken p-4">
    <h2 :id="headingId" class="mb-2 font-display text-lg font-semibold">
      {{
        proposal.tool === 'suggest_reading'
          ? 'Suggested reading'
          : proposal.tool === 'create_idea'
            ? 'Suggested new idea'
            : 'Suggested change to this idea'
      }}<span v-if="proposal.tool === 'suggest_reading'" class="sr-only">: {{ address }}</span>
    </h2>

    <template v-if="proposal.tool === 'suggest_reading' && reading">
      <p class="mb-2 text-sm text-ink-soft">
        The coach is passing on an address you gave it. It has not read the page.
      </p>
      <p class="break-words font-medium">
        {{ reading.fetchedTitle ?? (suggestedTitle || address) }}
      </p>
      <p class="mb-2 break-all text-sm">
        {{ address }}
        <a :href="address" target="_blank" rel="noopener noreferrer" class="ml-1 underline">
          Open the page<span class="sr-only"> (opens in a new tab)</span>
        </a>
      </p>
      <dl class="mb-3 space-y-1 text-sm">
        <div v-if="reading.fetchedTitle !== null">
          <dt class="mr-1 inline font-medium">The page's own title:</dt>
          <dd class="inline">{{ reading.fetchedTitle }}</dd>
        </div>
        <div v-if="reading.fetchedAuthors.length">
          <dt class="mr-1 inline font-medium">The page names as author:</dt>
          <dd class="inline">{{ reading.fetchedAuthors.join(', ') }}</dd>
        </div>
        <div v-if="suggestedTitle">
          <dt class="mr-1 inline font-medium">The AI called it:</dt>
          <dd class="inline">{{ suggestedTitle }}</dd>
        </div>
        <div>
          <dt class="mr-1 inline font-medium">Why the AI suggests it (unchecked):</dt>
          <dd class="inline">{{ proposal.input.why }}</dd>
        </div>
      </dl>
      <p v-if="reading.check === 'found'" class="mb-3 text-sm text-ink-soft">
        We looked at the address and the page exists. If you add it, it is listed under its own
        title.
      </p>
      <p v-else-if="reading.check === 'no-title'" class="mb-3 callout !p-2 text-sm">
        We couldn't read a title from this page, so we can't confirm what it is.
        {{
          suggestedTitle
            ? `If you add it, it is listed as “${suggestedTitle}”, the AI's guess.`
            : 'If you add it, it is listed by its address.'
        }}
      </p>
      <p
        v-else-if="reading.check === 'not-found'"
        class="mb-3 rounded-ctl bg-danger-wash p-2 text-sm text-danger"
      >
        Problem: we couldn't find a website at this address, so the page may not exist. It can't be
        added.
      </p>
      <p v-else class="mb-3 rounded-ctl bg-danger-wash p-2 text-sm text-danger">
        Problem: this address isn't a public website, so it can't be added.
      </p>
    </template>

    <template v-else-if="proposal.tool === 'update_idea'">
      <div class="mb-3">
        <p class="text-sm font-medium">Title</p>
        <p v-if="pending && idea" class="text-sm text-ink-soft">
          Now: <span class="line-through decoration-line-strong">{{ idea.name }}</span>
          <span class="sr-only">(would be replaced)</span>
        </p>
        <p><span v-if="pending" class="text-sm text-ink-soft">Suggested: </span>{{ name }}</p>
      </div>
    </template>
    <template v-else>
      <p class="mb-1 font-medium">{{ name }}</p>
      <p v-if="proposal.input.notes" class="mb-3 whitespace-pre-wrap text-sm">
        {{ proposal.input.notes }}
      </p>
      <p v-else class="mb-3 text-sm text-ink-soft">No notes yet.</p>
    </template>

    <template v-if="pending">
      <p v-if="proposal.stale" role="status" class="mb-3 callout !p-2 text-sm">
        The title has changed since this was suggested. Accepting will replace it with the
        suggestion.
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn btn-sm btn-primary"
          :aria-label="`${proposal.stale ? 'Apply anyway' : 'Accept'}: ${what}`"
          :disabled="busy || unusable"
          @click="accept.mutate()"
        >
          {{
            accept.isPending.value
              ? 'Applying…'
              : proposal.tool === 'suggest_reading'
                ? 'Add to reading list'
                : proposal.stale
                  ? 'Apply anyway'
                  : 'Accept'
          }}
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
        class="mt-2 text-sm text-danger"
      >
        {{ errorMessage(accept.error.value ?? dismiss.error.value) }}
      </p>
    </template>
    <p v-else-if="proposal.status === 'accepted'" class="text-sm text-ink-soft">
      {{ proposal.tool === 'suggest_reading' ? 'Added to the reading list' : 'Accepted'
      }}{{ proposal.decidedByName ? ` by ${proposal.decidedByName}` : '' }}.
      <RouterLink
        v-if="proposal.createdIdeaId"
        :to="{ name: 'idea-notes', params: { publicationId, id: proposal.createdIdeaId } }"
        class="underline"
      >
        Open the new idea
      </RouterLink>
    </p>
    <p v-else class="text-sm text-ink-soft">
      Dismissed{{ proposal.decidedByName ? ` by ${proposal.decidedByName}` : '' }}.
    </p>
  </section>
</template>
