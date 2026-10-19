<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, useId } from 'vue'
import type { ResearchItem, ResearchRun } from '@wordwright/core'
import type { PostDecision } from '../lib/recent-posts'
import { api, errorMessage } from '../lib/api'
import { invalidateRoots } from '../lib/queries'
import HoldButton from './HoldButton.vue'
import Icon from './Icon.vue'
import ResearchItemRow from './ResearchItemRow.vue'

const props = defineProps<{ publicationId: string; ideaId: string; run: ResearchRun }>()

const queryClient = useQueryClient()
const headingId = useId()
const notice = ref('') // said out loud to screen readers after each decision

// Whatever happens, the run and the reading list may have changed (someone else may have decided first).
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
          ? `Added “${title}” to the reading list.`
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
// As on the Search page, pages still to decide come first and decided ones drop to the end.
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
        class="min-w-0 whitespace-pre-wrap break-words font-display text-lg font-semibold"
      >
        {{ run.areas }}
      </h3>
      <HoldButton
        tip="Press and hold, or tap twice, to delete this research. Pages you added to the reading list stay there."
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
    <p v-if="waiting" class="mb-3 text-sm">
      <span class="bg-mark">Highlighted text is your AI’s reason for suggesting this item.</span>
    </p>
    <p class="sr-only" aria-live="polite">{{ notice }}</p>

    <p v-if="!run.items.length" class="mb-3 text-ink-soft">
      Nothing worth reading turned up. Try describing the areas differently.
    </p>
    <ul v-else class="mb-3 divide-y divide-line rounded-ctl border border-line bg-surface">
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
