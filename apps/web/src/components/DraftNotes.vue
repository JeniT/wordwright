<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { IdeaLink, IdeaNote } from '@lfwa/core'
import { api, errorMessage } from '../lib/api'
import { noteOriginPhrase } from '../lib/note-label'
import NoteOrigin from './NoteOrigin.vue'
import NoteText from './NoteText.vue'
import { hasTag, tagsUsedOn } from '../lib/note-tags'
import NoteTags from './NoteTags.vue'
import TagFilter from './TagFilter.vue'

const props = defineProps<{
  profileId: string
  ideaId: string
  readingList: readonly IdeaLink[]
  /** Puts the note in the draft and saves it; rejects (with a message) if that didn't work. */
  insert: (note: IdeaNote) => Promise<void>
}>()
const queryClient = useQueryClient()

const notes = useQuery({
  queryKey: ['notes', () => props.profileId, () => props.ideaId],
  queryFn: () => api.listIdeaNotes(props.profileId, props.ideaId),
})
const tagFilter = ref<string | null>(null)
const usedTags = computed(() => tagsUsedOn((notes.data.value ?? []).filter((n) => !n.addedAt)))
watch(usedTags, (tags) => {
  if (tagFilter.value && !tags.some((t) => t.toLowerCase() === tagFilter.value!.toLowerCase())) {
    tagFilter.value = null
  }
})
const waiting = computed(() =>
  (notes.data.value ?? []).filter((n) => !n.addedAt && hasTag(n, tagFilter.value)),
)
const added = computed(() => (notes.data.value ?? []).filter((n) => n.addedAt))
const showAdded = ref(false)

const refresh = () =>
  Promise.all(
    ['notes', 'idea', 'ideas', 'draft-insertions'].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    ),
  )

const adding = useMutation({
  mutationFn: (note: IdeaNote) => props.insert(note),
  onSettled: refresh,
})
const putBack = useMutation({
  mutationFn: (note: IdeaNote) => api.setNoteAdded(props.profileId, props.ideaId, note.id, false),
  onSettled: refresh,
})

/** A short name for a note, for button labels. */
const label = (note: IdeaNote) => {
  const first = note.text.split('\n', 1)[0]!
  return `note “${first.length > 40 ? `${first.slice(0, 40)}…` : first}”`
}
</script>

<template>
  <div>
    <h2 id="draft-notes-heading" class="mb-1 font-serif text-xl font-semibold">Notes</h2>
    <p class="mb-3 text-sm text-stone-700">
      Add a note to put its words into the draft, after the paragraph you are in. The draft is saved
      as you do.
    </p>

    <p v-if="notes.isPending.value">Loading notes…</p>
    <div v-else-if="notes.isError.value" role="alert" class="mb-3">
      <p class="text-red-700">We couldn't load the notes.</p>
      <button type="button" class="btn btn-outline mt-2" @click="notes.refetch()">Try again</button>
    </div>
    <template v-else>
      <p v-if="!notes.data.value?.length" class="text-stone-600">
        No notes yet.
        <RouterLink :to="{ name: 'idea', params: { profileId, id: ideaId } }" class="underline">
          Add some on the idea page.
        </RouterLink>
      </p>
      <TagFilter v-model="tagFilter" :tags="usedTags" />
      <p v-if="notes.data.value?.length && !waiting.length" class="text-stone-600">
        {{ tagFilter ? 'No notes left with this tag.' : 'All your notes are in a draft.' }}
      </p>

      <ul v-if="waiting.length" aria-label="Notes to add" class="mb-3 space-y-2">
        <li
          v-for="note in waiting"
          :key="note.id"
          class="rounded border border-stone-200 bg-white p-3"
        >
          <NoteText :note="note" />
          <NoteTags :tags="note.tags" />
          <p class="mt-1 text-xs text-stone-600">
            <NoteOrigin
              :phrase="noteOriginPhrase(note, readingList)"
              :author-name="note.authorName"
            />
          </p>
          <button
            type="button"
            class="btn btn-sm btn-outline mt-2"
            :disabled="adding.isPending.value"
            :aria-label="`Add ${label(note)} to the draft`"
            @click="adding.mutate(note)"
          >
            {{
              adding.isPending.value && adding.variables.value?.id === note.id
                ? 'Adding…'
                : 'Add to draft'
            }}
          </button>
        </li>
      </ul>
      <p v-if="adding.isError.value" role="alert" class="mb-3 text-red-700">
        {{ errorMessage(adding.error.value) }}
      </p>

      <div v-if="added.length" class="border-t border-stone-200 pt-3">
        <label class="flex items-center gap-2 text-sm">
          <input v-model="showAdded" type="checkbox" class="size-4 accent-accent" />
          Show notes already added ({{ added.length }})
        </label>
        <ul v-if="showAdded" class="mt-2 space-y-2">
          <li
            v-for="note in added"
            :key="note.id"
            class="rounded border border-stone-200 bg-stone-50 p-3 text-stone-700"
          >
            <NoteText :note="note" />
            <p class="mt-1 text-xs text-stone-600">
              <NoteOrigin
                :phrase="noteOriginPhrase(note, readingList)"
                :author-name="note.authorName"
              />
            </p>
            <button
              type="button"
              class="btn btn-sm btn-neutral mt-2"
              :disabled="putBack.isPending.value"
              :aria-label="`Put ${label(note)} back`"
              @click="putBack.mutate(note)"
            >
              Put back
            </button>
          </li>
        </ul>
        <p v-if="putBack.isError.value" role="alert" class="mt-2 text-red-700">
          Couldn't put that note back. Please try again.
        </p>
      </div>
    </template>
  </div>
</template>
