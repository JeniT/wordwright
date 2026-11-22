<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, nextTick, ref, useId, watch } from 'vue'
import type { ResearchItem, ResearchRun } from '@wordwright/core'
import type { PostDecision } from '../lib/recent-posts'
import { api, errorMessage } from '../lib/api'
import { invalidateRoots } from '../lib/queries'
import { inProgress, researchStateLine } from '../lib/research-state'
import { useSessionStore } from '../stores/session'
import AiButton from './AiButton.vue'
import HoldButton from './HoldButton.vue'
import Icon from './Icon.vue'
import ResearchItemRow from './ResearchItemRow.vue'

const props = defineProps<{ publicationId: string; ideaId: string; run: ResearchRun }>()

const queryClient = useQueryClient()
const headingId = useId()
const notice = ref('') // said out loud to screen readers after each decision

// Whatever happens, the run and the articles may have changed (someone else may have decided first).
const refresh = () => invalidateRoots(queryClient, 'research', 'idea', 'ideas')
const add = useMutation({
  mutationFn: (id: string) =>
    api.addResearchItem(props.publicationId, props.ideaId, props.run.id, id),
  onSettled: refresh,
})
const ignore = useMutation({
  mutationFn: (id: string) =>
    api.ignoreResearchItem(props.publicationId, props.ideaId, props.run.id, id),
  onSettled: refresh,
})
const reconsider = useMutation({
  mutationFn: (id: string) =>
    api.reconsiderResearchItem(props.publicationId, props.ideaId, props.run.id, id),
  onSettled: refresh,
})
function decide(item: ResearchItem, what: PostDecision) {
  const title = item.fetchedTitle || item.title || item.url
  const mutation = what === 'add' ? add : what === 'ignore' ? ignore : reconsider
  mutation.mutate(item.id, {
    onSuccess: () => {
      notice.value =
        what === 'add'
          ? `Added “${title}” to the articles.`
          : what === 'ignore'
            ? `Ignored “${title}”.`
            : `“${title}” is back in the list.`
    },
  })
}
const busy = computed(
  () => add.isPending.value || ignore.isPending.value || reconsider.isPending.value,
)
const problem = computed(() => add.error.value ?? ignore.error.value ?? reconsider.error.value)
function clearProblem() {
  add.reset()
  ignore.reset()
  reconsider.reset()
}

// A search that isn't finished (#447): its state where the pages go, and Cancel or Try again for its sender.
const session = useSessionStore()
const mine = computed(() => !!props.run.createdBy && props.run.createdBy === session.user?.id)
const stateLine = computed(() => researchStateLine(props.run))
const cancel = useMutation({
  mutationFn: () => api.cancelResearch(props.publicationId, props.ideaId, props.run.id),
  onSettled: refresh,
})
const tryAgain = useMutation({
  mutationFn: () => api.tryResearchAgain(props.publicationId, props.ideaId, props.run.id),
  onSettled: refresh,
})
// Cancel and Try again go when the state changes; focus on one of them goes to the run's heading, not the page.
const heading = ref<HTMLElement | null>(null)
const controls = ref<HTMLElement | null>(null)
watch(
  () => props.run.state,
  () => {
    if (!controls.value?.contains(document.activeElement)) return
    void nextTick(() => {
      if (!controls.value?.contains(document.activeElement)) heading.value?.focus()
    })
  },
  { flush: 'pre' },
)

const remove = useMutation({
  mutationFn: () => api.deleteResearch(props.publicationId, props.ideaId, props.run.id),
  onSettled: async () => {
    await refresh()
  },
})
const when = computed(() =>
  new Date(props.run.createdAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }),
)
// As on the Scan page, pages still to decide come first and decided ones drop to the end.
const items = computed(() => [
  ...props.run.items.filter((i) => i.status === 'suggested'),
  ...props.run.items.filter((i) => i.status !== 'suggested'),
])
// The reason is only shown on pages still to decide, so the line that explains the highlight is too.
const waiting = computed(() => props.run.items.some((i) => i.status === 'suggested'))
</script>

<template>
  <article :aria-labelledby="headingId">
    <div class="mb-1 flex items-start justify-between gap-3">
      <h3
        :id="headingId"
        ref="heading"
        tabindex="-1"
        class="min-w-0 whitespace-pre-wrap break-words font-display text-lg font-semibold focus:outline-none"
      >
        {{ run.areas }}
      </h3>
      <HoldButton
        tip="Press and hold, or tap twice, to delete this research. Pages you added to the articles stay there."
        verb="Delete"
        class="btn btn-sm btn-icon btn-ghost btn-ghost-danger shrink-0"
        :aria-label="`Delete this research: ${run.areas}`"
        :disabled="remove.isPending.value"
        @confirm="remove.mutate()"
      >
        <Icon name="remove" />
      </HoldButton>
    </div>
    <p class="mb-3 text-sm text-ink-soft">
      <template v-if="run.createdByName">{{ run.createdByName }} · </template>{{ when }}
    </p>
    <template v-if="run.state !== 'finished'">
      <p v-if="inProgress(run)" class="mb-3 flex items-center gap-2" role="status">
        <Icon
          v-if="run.state === 'searching'"
          name="working"
          class="shrink-0 motion-safe:animate-spin"
        />
        {{ stateLine }}
      </p>
      <div v-else class="callout callout-danger mb-3 flex items-start gap-2" role="alert">
        <Icon name="alert" class="mt-0.5 shrink-0" />
        <p>{{ stateLine }}</p>
      </div>
      <div ref="controls" class="mb-3 flex flex-wrap gap-2">
        <button
          v-if="mine && inProgress(run)"
          type="button"
          class="btn btn-sm btn-outline"
          :disabled="cancel.isPending.value"
          @click="cancel.mutate()"
        >
          Cancel search
        </button>
        <AiButton
          v-if="mine && run.canTryAgain"
          class="btn btn-sm btn-outline"
          :busy="tryAgain.isPending.value"
          busy-text="Sending"
          @click="tryAgain.mutate()"
        >
          Try again
        </AiButton>
      </div>
      <p
        v-if="cancel.isError.value || tryAgain.isError.value"
        role="alert"
        class="mb-3 text-sm text-danger"
      >
        {{ errorMessage(cancel.error.value ?? tryAgain.error.value) }}
      </p>
    </template>
    <p v-else-if="waiting" class="mb-3 text-sm">
      <span class="bg-mark">Highlighted text is your AI’s reason for suggesting this item.</span>
    </p>
    <p class="sr-only" aria-live="polite">{{ notice }}</p>

    <p v-if="run.state === 'finished' && !run.items.length" class="mb-3 text-ink-soft">
      Nothing worth reading turned up. Try describing the areas differently.
    </p>
    <ul
      v-else-if="run.items.length"
      class="mb-3 divide-y divide-line rounded-ctl border border-line bg-surface"
    >
      <ResearchItemRow
        v-for="item in items"
        :key="item.id"
        :item="item"
        :busy="busy"
        @decide="(what) => decide(item, what)"
      />
    </ul>

    <div v-if="problem" role="alert" class="mb-2 text-sm text-danger">
      {{ errorMessage(problem) }}
      <button type="button" class="ml-2 underline" @click="clearProblem">Dismiss</button>
    </div>
    <p v-if="remove.isError.value" role="alert" class="mt-2 text-sm text-danger">
      {{ errorMessage(remove.error.value) }}
    </p>
  </article>
</template>
