<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { IdeaLink, IdeaNote } from '@lfwa/core'
import { api, errorMessage } from '../lib/api'
import { dragLabel, removeDragLabel } from '../lib/drag-label'
import { NOTE_DRAG_TYPE } from '../lib/note-drag'
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

/** Drag a note out of the list, to drop it on the draft (see RichEditor). Only the note's id travels. */
function onDragStart(event: DragEvent, note: IdeaNote) {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData(NOTE_DRAG_TYPE, note.id)
  event.dataTransfer.setDragImage(dragLabel(label(note)), 12, 12)
}

/** A short name for a note, for button labels. */
const label = (note: IdeaNote) => {
  const first = note.text.split('\n', 1)[0]!
  return `note “${first.length > 40 ? `${first.slice(0, 40)}…` : first}”`
}
</script>

<template>
  <div>
    <h2 id="draft-notes-heading" class="mb-1 font-display text-xl font-semibold">Notes</h2>
    <p class="mb-3 text-sm text-ink-soft">
      Add a note to put its words into the draft, after the paragraph you are in, or drag it by its
      grip to where you want it. The draft is saved as you do.
    </p>

    <p v-if="notes.isPending.value">Loading notes…</p>
    <div v-else-if="notes.isError.value" role="alert" class="mb-3">
      <p class="text-danger">We couldn't load the notes.</p>
      <button type="button" class="btn btn-outline mt-2" @click="notes.refetch()">Try again</button>
    </div>
    <template v-else>
      <p v-if="!notes.data.value?.length" class="text-ink-soft">
        No notes yet.
        <RouterLink
          :to="{ name: 'idea-notes', params: { profileId, id: ideaId } }"
          class="underline"
        >
          Add some on the idea page.
        </RouterLink>
      </p>
      <TagFilter v-model="tagFilter" :tags="usedTags" />
      <p v-if="notes.data.value?.length && !waiting.length" class="text-ink-soft">
        {{ tagFilter ? 'No notes left with this tag.' : 'All your notes are in a draft.' }}
      </p>

      <ul v-if="waiting.length" aria-label="Notes to add" class="mb-3 space-y-2">
        <li
          v-for="note in waiting"
          :key="note.id"
          class="flex gap-2 rounded-ctl border border-line bg-surface p-3"
        >
          <!-- Dragging needs a mouse, and the draft is behind the drawer on a phone, so the grip is for wide screens;
               everyone can use the button. -->
          <span
            class="hidden cursor-grab select-none text-ink-soft lg:inline"
            draggable="true"
            title="Drag into the draft"
            aria-hidden="true"
            data-testid="note-grip"
            @dragstart="onDragStart($event, note)"
            @dragend="removeDragLabel"
          >
            ⠿
          </span>
          <div class="min-w-0 flex-1">
            <NoteText :note="note" />
            <NoteTags :tags="note.tags" />
            <p class="mt-1 text-xs text-ink-soft">
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
          </div>
        </li>
      </ul>
      <p v-if="adding.isError.value" role="alert" class="mb-3 text-danger">
        {{ errorMessage(adding.error.value) }}
      </p>

      <div v-if="added.length" class="border-t border-line pt-3">
        <label class="flex items-center gap-2 text-sm">
          <input v-model="showAdded" type="checkbox" class="size-4 accent-accent" />
          Show notes already added ({{ added.length }})
        </label>
        <ul v-if="showAdded" class="mt-2 space-y-2">
          <li
            v-for="note in added"
            :key="note.id"
            class="rounded-ctl border border-line bg-sunken p-3 text-ink-soft"
          >
            <NoteText :note="note" />
            <p class="mt-1 text-xs text-ink-soft">
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
        <p v-if="putBack.isError.value" role="alert" class="mt-2 text-danger">
          Couldn't put that note back. Please try again.
        </p>
      </div>
    </template>
  </div>
</template>
