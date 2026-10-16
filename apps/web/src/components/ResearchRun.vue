<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, useId } from 'vue'
import type { ResearchItem, ResearchRun } from '@wordwright/core'
import { api, errorMessage } from '../lib/api'
import { invalidateRoots } from '../lib/queries'
import HoldButton from './HoldButton.vue'
import Icon from './Icon.vue'

const props = defineProps<{ publicationId: string; ideaId: string; run: ResearchRun }>()

const queryClient = useQueryClient()
const headingId = useId()

/** A page that doesn't exist, or isn't public, can't go on the reading list. */
const unusable = (item: ResearchItem) => item.check === 'not-found' || item.check === 'not-public'
const name = (item: ResearchItem) => item.fetchedTitle || item.title || item.url

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
const when = computed(() => new Date(props.run.createdAt).toLocaleDateString())
</script>

<template>
  <article :aria-labelledby="headingId" class="panel p-4">
    <h3
      :id="headingId"
      class="mb-1 whitespace-pre-wrap break-words font-display text-lg font-semibold"
    >
      {{ run.areas }}
    </h3>
    <p class="mb-3 text-sm text-ink-soft">
      Researched{{ run.createdByName ? ` by ${run.createdByName}` : '' }} on {{ when }} ·
      {{ run.model }}
    </p>

    <p v-if="!run.items.length" class="mb-3 text-ink-soft">
      Nothing new turned up that looked worth reading. Try describing the areas differently.
    </p>

    <ul v-else class="mb-3 space-y-3">
      <li
        v-for="item in run.items"
        :key="item.id"
        class="border-t border-line pt-3 first:border-t-0 first:pt-0"
      >
        <!-- Decided: just the title, how it went, and a way back. -->
        <div v-if="item.status !== 'suggested'" class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            v-if="item.status === 'added'"
            class="font-bold text-ok"
            role="img"
            aria-label="Added to the reading list"
            >✓</span
          >
          <span v-else class="font-bold text-danger" role="img" aria-label="Ignored">✗</span>
          <span
            class="min-w-0 flex-1 break-words"
            :class="item.status === 'dismissed' ? 'text-ink-soft' : ''"
            >{{ name(item) }}</span
          >
          <button
            type="button"
            class="btn btn-sm btn-neutral"
            :disabled="busy"
            :aria-label="`Reconsider: ${name(item)}`"
            @click="reconsider.mutate(item.id)"
          >
            Reconsider
          </button>
        </div>

        <!-- Waiting for a decision: everything needed to make one. -->
        <div v-else>
          <p class="break-words font-medium">{{ name(item) }}</p>
          <p class="break-all text-sm">
            {{ item.url }}
            <a :href="item.url" target="_blank" rel="noopener noreferrer" class="ml-1 underline">
              Open the page<span class="sr-only"> “{{ name(item) }}” (opens in a new tab)</span>
            </a>
          </p>
          <p
            v-if="item.fetchedTitle && item.title && item.title !== item.fetchedTitle"
            class="text-sm"
          >
            <span class="font-medium">The search called it:</span> {{ item.title }}
          </p>
          <p v-if="item.fetchedAuthors.length" class="text-sm">
            <span class="font-medium">The page names as author:</span>
            {{ item.fetchedAuthors.join(', ') }}
          </p>
          <p class="text-sm">
            <span class="font-medium">Why the AI suggests it (unchecked):</span> {{ item.why }}
          </p>
          <p v-if="item.check === 'no-title'" class="mt-1 callout !p-2 text-sm">
            We couldn't read a title from this page, so we can't confirm what it is. If you add it,
            it is listed as “{{ item.title || item.url }}”.
          </p>
          <p
            v-else-if="item.check === 'not-found'"
            class="mt-1 rounded-ctl bg-danger-wash p-2 text-sm text-danger"
          >
            Problem: we couldn't find a website at this address, so the page may not exist. It can't
            be added.
          </p>
          <p
            v-else-if="item.check === 'not-public'"
            class="mt-1 rounded-ctl bg-danger-wash p-2 text-sm text-danger"
          >
            Problem: this address isn't a public website, so it can't be added.
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              class="btn btn-sm btn-primary"
              :disabled="unusable(item) || busy"
              :aria-label="`Add to the reading list: ${name(item)}`"
              @click="add.mutate(item.id)"
            >
              Add
            </button>
            <button
              type="button"
              class="btn btn-sm btn-neutral"
              :disabled="busy"
              :aria-label="`Ignore: ${name(item)}`"
              @click="ignore.mutate(item.id)"
            >
              Ignore
            </button>
          </div>
        </div>
      </li>
    </ul>

    <div v-if="problem" role="alert" class="mb-2 text-sm text-danger">
      {{ errorMessage(problem) }}
      <button type="button" class="ml-2 underline" @click="clearProblem">Dismiss</button>
    </div>

    <p class="mt-3 border-t border-line pt-2">
      <HoldButton
        :tip="'Press and hold, or tap twice, to delete this research. Pages you added to the reading list stay there.'"
        verb="Delete"
        class="btn btn-sm btn-icon btn-ghost btn-ghost-danger"
        :aria-label="`Delete this research: ${run.areas}`"
        :disabled="remove.isPending.value"
        @confirm="remove.mutate()"
      >
        <Icon name="remove" />
      </HoldButton>
    </p>
    <p v-if="remove.isError.value" role="alert" class="mt-2 text-sm text-danger">
      {{ errorMessage(remove.error.value) }}
    </p>
  </article>
</template>
