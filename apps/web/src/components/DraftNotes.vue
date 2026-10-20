<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { IdeaLink, IdeaNote } from '@wordwright/core'
import { api, errorMessage } from '../lib/api'
import { refreshNotesEverywhere, useIdeaNotes } from '../lib/queries'
import { dragLabel, removeDragLabel } from '../lib/drag-label'
import { NOTE_DRAG_TYPE } from '../lib/note-drag'
import { noteOrigin } from '../lib/note-label'
import { useSessionStore } from '../stores/session'
import Explain from './Explain.vue'
import NoteOrigin from './NoteOrigin.vue'
import NoteText from './NoteText.vue'
import { hasTag, tagsUsedOn } from '../lib/note-tags'
import NoteTags from './NoteTags.vue'
import TagFilter from './TagFilter.vue'
import QueryState from './QueryState.vue'
import SwitchField from './SwitchField.vue'

const session = useSessionStore()
const props = defineProps<{
  publicationId: string
  ideaId: string
  readingList: readonly IdeaLink[]
  /** Puts the note in the draft and saves it; rejects (with a message) if that didn't work. */
  insert: (note: IdeaNote) => Promise<void>
  /** Who may add notes to the draft when it is not the person looking (the draft's editor); undefined if they may. */
  onlyEditor?: string
}>()
const queryClient = useQueryClient()

const { notes } = useIdeaNotes(
  () => props.publicationId,
  () => props.ideaId,
)
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

const refresh = () => refreshNotesEverywhere(queryClient)

const adding = useMutation({
  mutationFn: (note: IdeaNote) => props.insert(note),
  onSettled: refresh,
})
const putBack = useMutation({
  mutationFn: (note: IdeaNote) =>
    api.setNoteAdded(props.publicationId, props.ideaId, note.id, false),
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
    <!-- The tab beside the draft already says "Notes"; the heading is for screen readers moving by headings. -->
    <h2 id="draft-notes-heading" class="sr-only">Notes</h2>
    <p v-if="onlyEditor" class="mb-3 text-sm text-ink-soft">
      Only {{ onlyEditor }}, the draft’s editor, can add notes to the draft.
    </p>
    <Explain v-else label="About adding notes" class="mb-3">
      Add a note to put its words after the paragraph you are in, or drag it by its grip to where
      you want it. The draft is saved as you do.
    </Explain>

    <QueryState :query="notes" what="the notes" loading="Loading notes…">
      <p v-if="!notes.data.value?.length" class="text-ink-soft">
        No notes yet.
        <RouterLink
          :to="{ name: 'idea-notes', params: { publicationId, id: ideaId } }"
          class="underline"
        >
          Add notes on the idea page.
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
            v-if="!onlyEditor"
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
                v-bind="noteOrigin(note, readingList, session.user?.id ?? null)"
                :author-name="note.authorName"
              />
            </p>
            <button
              v-if="!onlyEditor"
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
        <SwitchField v-model="showAdded" compact :label="`Show added (${added.length})`" />
        <p v-if="showAdded" class="mt-2 text-sm text-ink-soft">
          Putting a note back doesn’t remove its words from the draft.
        </p>
        <ul v-if="showAdded" class="mt-2 space-y-2">
          <li
            v-for="note in added"
            :key="note.id"
            class="rounded-ctl border border-line bg-sunken p-3 text-ink-soft"
          >
            <NoteText :note="note" />
            <p class="mt-1 text-xs text-ink-soft">
              <NoteOrigin
                v-bind="noteOrigin(note, readingList, session.user?.id ?? null)"
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
          Sorry, we couldn’t put that note back. Please try again.
        </p>
      </div>
    </QueryState>
  </div>
</template>
