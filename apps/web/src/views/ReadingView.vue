<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { IdeaNote } from '@lfwa/core'
import TextAreaField from '../components/TextAreaField.vue'
import { api, errorMessage } from '../lib/api'
import { noteOriginLabel } from '../lib/note-label'

const props = defineProps<{ profileId: string; id: string; linkId: string }>()
const queryClient = useQueryClient()

const idea = useQuery({
  queryKey: ['idea', () => props.profileId, () => props.id],
  queryFn: () => api.getIdea(props.profileId, props.id),
})
const item = computed(() => idea.data.value?.links.find((l) => l.id === props.linkId))

const notesKey = () => ['notes', props.profileId, props.id]
const notes = useQuery({
  queryKey: ['notes', () => props.profileId, () => props.id],
  queryFn: () => api.listIdeaNotes(props.profileId, props.id),
})
/** Only what was taken from this item; the idea page has all of the idea's notes. */
const itemNotes = computed(
  () => notes.data.value?.filter((n) => n.readingItemId === props.linkId) ?? [],
)

const label = computed(() => item.value?.title || item.value?.url || '')

// Whether it has been read is the writer's say-so (they may have read it offline), as on the idea page.
const setRead = useMutation({
  mutationFn: (read: boolean) =>
    api.setReadingItemRead(props.profileId, props.id, props.linkId, read),
  onSuccess: async (saved) => {
    queryClient.setQueryData(['idea', props.profileId, props.id], saved)
    await queryClient.invalidateQueries({ queryKey: ['ideas'] })
  },
  // The box has already flipped under the person's finger; put it back to what is saved.
  onError: () => {
    if (readBox.value) readBox.value.checked = !!item.value?.readAt
  },
})
const readBox = ref<HTMLInputElement>()

const text = ref('')
const addBox = ref<HTMLElement>()
const add = useMutation({
  mutationFn: () => api.addIdeaNote(props.profileId, props.id, text.value, props.linkId),
  onSuccess: async (note) => {
    text.value = ''
    queryClient.setQueryData(notesKey(), (old: IdeaNote[] | undefined) => [...(old ?? []), note])
    // A note also changes the idea's "last changed" time, and its text as brainstorming sees it.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['idea', props.profileId, props.id] }),
      queryClient.invalidateQueries({ queryKey: ['ideas'] }),
    ])
    addBox.value?.querySelector('textarea')?.focus()
  },
})
</script>

<template>
  <p v-if="idea.isPending.value">Loading…</p>
  <div
    v-else-if="idea.isError.value || !item"
    role="alert"
    class="rounded border border-stone-200 bg-white p-6"
  >
    <h1 class="font-serif text-lg">We couldn't open that reading-list item</h1>
    <p class="mt-1 text-stone-700">
      It may have been removed from the reading list, or the connection may have dropped. Try
      reloading the page.
    </p>
    <RouterLink
      :to="{ name: 'idea', params: { profileId, id } }"
      class="mt-3 inline-block underline"
    >
      Back to the idea
    </RouterLink>
  </div>

  <article v-else aria-labelledby="reading-heading" class="max-w-2xl">
    <p class="mb-2 text-sm">
      <RouterLink :to="{ name: 'idea', params: { profileId, id } }" class="underline">
        ← Back to “{{ idea.data.value?.name }}”
      </RouterLink>
    </p>
    <h1 id="reading-heading" class="mb-2 font-serif text-2xl font-semibold break-words">
      {{ label }}
    </h1>

    <section aria-labelledby="page-heading" class="mb-8">
      <h2 id="page-heading" class="sr-only">The page</h2>
      <p class="mb-2">
        <a :href="item.url" target="_blank" rel="noopener noreferrer" class="underline">
          Open the page<span class="sr-only"> (opens in a new tab)</span>
        </a>
        <span class="block truncate text-sm text-stone-600">{{ item.url }}</span>
      </p>
      <p class="mb-3 text-sm text-stone-700">
        Most websites can't be shown inside another page, so it opens in its own tab. Put the two
        tabs side by side if you can, and keep this one open to write down what you find.
      </p>
      <label class="flex items-center gap-2 text-sm">
        <input
          ref="readBox"
          type="checkbox"
          class="size-4 accent-accent"
          :checked="!!item.readAt"
          :disabled="setRead.isPending.value"
          @change="setRead.mutate(($event.target as HTMLInputElement).checked)"
        />
        I have read this
      </label>
      <p v-if="setRead.isError.value" role="alert" class="mt-1 text-sm text-red-700">
        Couldn't save that. Please try again.
      </p>
    </section>

    <section aria-labelledby="reading-notes-heading">
      <h2 id="reading-notes-heading" class="mb-1 font-serif text-xl font-semibold">
        Notes from this page
      </h2>
      <p class="mb-3 text-sm text-stone-700">
        Paste a quote, or put it in your own words. Each note keeps a link back to this page, and
        joins the rest of the idea's notes.
      </p>

      <p v-if="notes.isPending.value">Loading notes…</p>
      <div v-else-if="notes.isError.value" role="alert" class="mb-4">
        <p class="text-red-700">We couldn't load the notes.</p>
        <button type="button" class="btn btn-outline mt-2" @click="notes.refetch()">
          Try again
        </button>
      </div>
      <template v-else>
        <p v-if="!itemNotes.length" class="mb-4 text-stone-600">
          No notes from this page yet. Add the first below.
        </p>
        <ul v-else class="mb-4 divide-y divide-stone-200 rounded border border-stone-200 bg-white">
          <li v-for="note in itemNotes" :key="note.id" class="px-4 py-3">
            <p class="whitespace-pre-wrap break-words">{{ note.text }}</p>
            <p class="mt-1 text-xs text-stone-600">
              {{ noteOriginLabel(note, idea.data.value?.links ?? []) }}
            </p>
          </li>
        </ul>

        <form ref="addBox" @submit.prevent="add.mutate()">
          <TextAreaField
            v-model="text"
            label="Add a note from this page"
            :rows="4"
            :maxlength="20000"
            :hint="add.isError.value ? errorMessage(add.error.value) : undefined"
          />
          <button
            type="submit"
            class="btn btn-outline"
            :disabled="add.isPending.value || !text.trim()"
          >
            {{ add.isPending.value ? 'Adding…' : 'Add note' }}
          </button>
        </form>
      </template>
    </section>
  </article>
</template>
