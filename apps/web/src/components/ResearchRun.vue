<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, useId } from 'vue'
import type { ResearchItem, ResearchRun } from '@lfwa/core'
import { api, errorMessage } from '../lib/api'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps<{ profileId: string; ideaId: string; run: ResearchRun }>()

const queryClient = useQueryClient()
const headingId = useId()
const fieldId = useId()

/** A page that doesn't exist, or isn't public, can't go on the reading list. */
const unusable = (item: ResearchItem) => item.check === 'not-found' || item.check === 'not-public'
const open = computed(() => props.run.items.filter((i) => i.status === 'suggested'))
const choosable = computed(() => open.value.filter((i) => !unusable(i)))
const ticked = ref<string[]>([])
// Ticks only count for pages that are still waiting for a decision (another member may have decided some).
const chosen = computed(() => ticked.value.filter((id) => choosable.value.some((i) => i.id === id)))

const name = (item: ResearchItem) => item.fetchedTitle || item.title || item.url

// Whatever happens, the run and the reading list may have changed (someone else may have decided first).
const refresh = () =>
  Promise.all(
    ['research', 'idea', 'ideas'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
  )
const add = useMutation({
  mutationFn: () => api.addResearchItems(props.profileId, props.ideaId, props.run.id, chosen.value),
  onSuccess: () => (ticked.value = []),
  onSettled: refresh,
})
const setAside = useMutation({
  mutationFn: () =>
    api.dismissResearchItems(props.profileId, props.ideaId, props.run.id, chosen.value),
  onSuccess: () => (ticked.value = []),
  onSettled: refresh,
})
const busy = computed(() => add.isPending.value || setAside.isPending.value)

const confirmingDelete = ref(false)
const remove = useMutation({
  mutationFn: () => api.deleteResearch(props.profileId, props.ideaId, props.run.id),
  onSettled: async () => {
    confirmingDelete.value = false
    await refresh()
  },
})
const when = computed(() => new Date(props.run.createdAt).toLocaleDateString())
</script>

<template>
  <article :aria-labelledby="headingId" class="rounded border border-stone-300 bg-white p-4">
    <h3
      :id="headingId"
      class="mb-1 whitespace-pre-wrap break-words font-serif text-lg font-semibold"
    >
      {{ run.areas }}
    </h3>
    <p class="mb-3 text-sm text-stone-600">
      Researched{{ run.createdByName ? ` by ${run.createdByName}` : '' }} on {{ when }} ·
      {{ run.model }}
    </p>

    <p v-if="!run.items.length" class="mb-3 text-stone-700">
      Nothing new turned up that looked worth reading. Try describing the areas differently.
    </p>

    <ul v-else class="mb-3 space-y-4">
      <li
        v-for="item in run.items"
        :key="item.id"
        class="border-t border-stone-200 pt-3 first:border-t-0 first:pt-0"
      >
        <div class="flex items-start gap-3">
          <input
            v-if="item.status === 'suggested'"
            :id="`${fieldId}-${item.id}`"
            v-model="ticked"
            type="checkbox"
            :value="item.id"
            :disabled="unusable(item) || busy"
            class="mt-1.5 h-4 w-4 shrink-0"
          />
          <div class="min-w-0 flex-1">
            <component
              :is="item.status === 'suggested' ? 'label' : 'p'"
              :for="item.status === 'suggested' ? `${fieldId}-${item.id}` : undefined"
              class="block break-words font-medium"
              :class="item.status === 'dismissed' ? 'text-stone-500' : ''"
            >
              {{ name(item) }}
            </component>
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
            <p
              v-if="item.check === 'no-title'"
              class="mt-1 rounded bg-amber-50 p-2 text-sm text-amber-900"
            >
              We couldn't read a title from this page, so we can't confirm what it is. If you add
              it, it is listed as “{{ item.title || item.url }}”.
            </p>
            <p
              v-else-if="item.check === 'not-found'"
              class="mt-1 rounded bg-red-50 p-2 text-sm text-red-900"
            >
              Problem: we couldn't find a website at this address, so the page may not exist. It
              can't be added.
            </p>
            <p
              v-else-if="item.check === 'not-public'"
              class="mt-1 rounded bg-red-50 p-2 text-sm text-red-900"
            >
              Problem: this address isn't a public website, so it can't be added.
            </p>
            <p v-if="item.status === 'added'" class="mt-1 text-sm text-stone-700">
              Added to the reading list.
            </p>
            <p v-else-if="item.status === 'dismissed'" class="mt-1 text-sm text-stone-600">
              Set aside.
            </p>
          </div>
        </div>
      </li>
    </ul>

    <div v-if="open.length" class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="btn btn-sm btn-primary"
        :disabled="!chosen.length || busy"
        @click="add.mutate()"
      >
        {{ add.isPending.value ? 'Adding…' : `Add ticked to the reading list (${chosen.length})` }}
      </button>
      <button
        type="button"
        class="btn btn-sm btn-neutral"
        :disabled="!chosen.length || busy"
        @click="setAside.mutate()"
      >
        Set ticked aside
      </button>
      <button
        v-if="choosable.length > 1"
        type="button"
        class="btn btn-sm btn-neutral"
        :disabled="busy"
        @click="ticked = choosable.map((i) => i.id)"
      >
        Tick all
      </button>
    </div>
    <p
      v-if="add.isError.value || setAside.isError.value"
      role="alert"
      class="mt-2 text-sm text-red-700"
    >
      {{ errorMessage(add.error.value ?? setAside.error.value) }}
    </p>

    <p class="mt-3 border-t border-stone-200 pt-2 text-sm">
      <button type="button" class="text-red-700 underline" @click="confirmingDelete = true">
        Delete this research<span class="sr-only">: {{ run.areas }}</span>
      </button>
    </p>
    <p v-if="remove.isError.value" role="alert" class="mt-2 text-sm text-red-700">
      {{ errorMessage(remove.error.value) }}
    </p>
    <ConfirmDialog
      :open="confirmingDelete"
      title="Delete this research?"
      confirm-label="Yes, delete it"
      busy-label="Deleting…"
      :busy="remove.isPending.value"
      @confirm="remove.mutate()"
      @cancel="confirmingDelete = false"
    >
      This removes the list of pages it found. Pages you already added to the reading list stay
      there.
    </ConfirmDialog>
  </article>
</template>
