<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, nextTick, ref } from 'vue'
import type { IdeaLink, IdeaNote, NoteOrigin } from '@lfwa/core'
import { api, errorMessage } from '../lib/api'
import HoldButton from './HoldButton.vue'
import ReorderableList from './ReorderableList.vue'
import TextAreaField from './TextAreaField.vue'

const props = defineProps<{
  profileId: string
  ideaId: string
  /** The idea's reading list, to name the item a note was taken from. */
  readingList: readonly IdeaLink[]
}>()
const queryClient = useQueryClient()

const notesKey = () => ['notes', props.profileId, props.ideaId]
const notes = useQuery({
  queryKey: ['notes', () => props.profileId, () => props.ideaId],
  queryFn: () => api.listIdeaNotes(props.profileId, props.ideaId),
})

/** A change to the notes also changes the idea's "last changed" time, and its text as brainstorming sees it. */
const refreshAround = () =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ['idea', props.profileId, props.ideaId] }),
    queryClient.invalidateQueries({ queryKey: ['ideas'] }),
  ])

// ---- how the notes are laid out (a convenience that stays on this browser)
type View = 'cards' | 'list'
const VIEW_KEY = 'notes-view'
function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'cards'
  } catch {
    return 'cards'
  }
}
const view = ref<View>(loadView())
function chooseView(next: View) {
  view.value = next
  try {
    localStorage.setItem(VIEW_KEY, next)
  } catch {
    // Not remembering the choice is fine.
  }
}

/** Where a note came from, and who was there: this is a trusted space, so people are named. */
function originLabel(note: IdeaNote) {
  const who = note.authorName ?? 'a former member'
  const labels: Record<NoteOrigin, string> = {
    entered: `Added by ${who}`,
    brainstorm: `From brainstorming with ${who}`,
    reading: `From reading, by ${who}`,
  }
  const item = props.readingList.find((l) => l.id === note.readingItemId)
  // The item may have been removed since; the note keeps saying it came from reading.
  if (note.origin === 'reading' && item) {
    return `From reading “${item.title || item.url}”, by ${who}`
  }
  return labels[note.origin]
}

// ---- adding
const draft = ref('')
const addBox = ref<HTMLElement>()
const add = useMutation({
  mutationFn: () => api.addIdeaNote(props.profileId, props.ideaId, draft.value),
  onSuccess: async (note) => {
    draft.value = ''
    queryClient.setQueryData(notesKey(), (old: IdeaNote[] | undefined) => [...(old ?? []), note])
    await refreshAround()
    addBox.value?.querySelector('textarea')?.focus()
  },
})

// ---- editing one note at a time
const editingId = ref<string | null>(null)
const editText = ref('')
const list = ref<HTMLElement>()

async function startEditing(note: IdeaNote) {
  save.reset()
  editText.value = note.text
  editingId.value = note.id
  await nextTick()
  list.value?.querySelector<HTMLTextAreaElement>(`[data-edit-note="${note.id}"] textarea`)?.focus()
}
async function stopEditing() {
  const id = editingId.value
  editingId.value = null
  await nextTick()
  list.value?.querySelector<HTMLButtonElement>(`[data-edit-button="${id}"]`)?.focus()
}
const save = useMutation({
  mutationFn: (id: string) => api.updateIdeaNote(props.profileId, props.ideaId, id, editText.value),
  onSuccess: async (note) => {
    queryClient.setQueryData(notesKey(), (old: IdeaNote[] | undefined) =>
      old?.map((n) => (n.id === note.id ? note : n)),
    )
    await stopEditing()
    await refreshAround()
  },
})

// ---- removing
const remove = useMutation({
  mutationFn: (id: string) => api.removeIdeaNote(props.profileId, props.ideaId, id),
  onSuccess: async (_, id) => {
    queryClient.setQueryData(notesKey(), (old: IdeaNote[] | undefined) =>
      old?.filter((n) => n.id !== id),
    )
    if (editingId.value === id) editingId.value = null
    await refreshAround()
  },
  // The list on screen may be out of date; show the server's.
  onError: () => notes.refetch(),
})

// ---- reordering
const move = useMutation({
  mutationFn: (ids: string[]) => api.reorderIdeaNotes(props.profileId, props.ideaId, ids),
  onSuccess: async (saved) => {
    queryClient.setQueryData(notesKey(), saved)
    await refreshAround()
  },
  // The 409 says the list on screen is out of date; show the server's.
  onError: () => notes.refetch(),
})
/** Saves a new order; true if it was saved (the error is shown under the list). */
async function saveOrder(ids: string[]) {
  try {
    await move.mutateAsync(ids)
  } catch {
    return false
  }
  return true
}

/**
 * A card's text takes the full width beside its grip, so the buttons wrap underneath; in a list the text
 * keeps a readable width and the buttons sit beside it when there is room, and wrap below when there isn't.
 */
const contentClass = computed(() =>
  view.value === 'cards' ? 'min-w-0 basis-[calc(100%-2rem)]' : 'min-w-[12rem] flex-1',
)

/** A short name for a note, for button labels and announcements. */
const label = (note: IdeaNote) => {
  const first = note.text.split('\n', 1)[0]!
  return `note “${first.length > 40 ? `${first.slice(0, 40)}…` : first}”`
}
</script>

<template>
  <section aria-labelledby="notes-heading" class="mb-10">
    <div class="mb-1 flex flex-wrap items-center justify-between gap-3">
      <h2 id="notes-heading" class="font-serif text-xl font-semibold">Notes</h2>
      <div
        v-if="notes.data.value?.length"
        role="group"
        aria-label="Show notes as"
        class="flex gap-1"
      >
        <button
          v-for="option in ['cards', 'list'] as const"
          :key="option"
          type="button"
          class="btn btn-neutral"
          :class="{ 'border-accent': view === option }"
          :aria-pressed="view === option"
          @click="chooseView(option)"
        >
          {{ option === 'cards' ? 'Cards' : 'List' }}
        </button>
      </div>
    </div>
    <p class="mb-3 text-sm text-stone-700">
      One thought to a note, like index cards. Drag them, or use the arrows, to put them in order.
      To delete a note, press and hold its Delete button.
    </p>

    <p v-if="notes.isPending.value">Loading notes…</p>
    <div v-else-if="notes.isError.value" role="alert" class="mb-4">
      <p class="text-red-700">We couldn't load the notes.</p>
      <button type="button" class="btn btn-outline mt-2" @click="notes.refetch()">Try again</button>
    </div>
    <template v-else>
      <p v-if="!notes.data.value?.length" class="mb-4 text-stone-600">
        No notes yet. Jot down your first thought below.
      </p>
      <div v-else ref="list" class="mb-4">
        <ReorderableList
          :items="notes.data.value"
          :item-label="label"
          :save="saveOrder"
          :disabled="move.isPending.value"
          :layout="view"
        >
          <template #default="{ item: note }">
            <form
              v-if="editingId === note.id"
              :data-edit-note="note.id"
              :class="contentClass"
              @submit.prevent="save.mutate(note.id)"
              @keydown.esc="stopEditing"
            >
              <TextAreaField
                v-model="editText"
                :label="`Text of ${label(note)}`"
                :rows="4"
                :maxlength="20000"
                :hint="save.isError.value ? errorMessage(save.error.value) : undefined"
              />
              <div class="flex gap-2">
                <button
                  type="submit"
                  class="btn btn-primary"
                  :disabled="save.isPending.value || !editText.trim()"
                >
                  {{ save.isPending.value ? 'Saving…' : 'Save note' }}
                </button>
                <button
                  type="button"
                  class="btn btn-neutral"
                  :disabled="save.isPending.value"
                  @click="stopEditing"
                >
                  Cancel
                </button>
              </div>
            </form>
            <div v-else :class="contentClass">
              <p class="whitespace-pre-wrap break-words">{{ note.text }}</p>
              <p class="mt-1 text-xs text-stone-600">{{ originLabel(note) }}</p>
            </div>
          </template>
          <template #actions="{ item: note }">
            <button
              type="button"
              class="btn btn-neutral"
              :data-edit-button="note.id"
              :disabled="editingId === note.id"
              :aria-label="`Edit ${label(note)}`"
              @click="startEditing(note)"
            >
              Edit
            </button>
            <HoldButton
              class="btn btn-neutral"
              :disabled="remove.isPending.value"
              :aria-label="`Delete ${label(note)}`"
              @confirm="remove.mutate(note.id)"
            >
              Delete
            </HoldButton>
          </template>
        </ReorderableList>
        <p v-if="move.isError.value" role="alert" class="mt-2 text-red-700">
          {{ errorMessage(move.error.value) }}
        </p>
        <p v-if="remove.isError.value" role="alert" class="mt-2 text-red-700">
          Couldn't delete that note. Please try again.
        </p>
      </div>

      <form ref="addBox" @submit.prevent="add.mutate()">
        <TextAreaField
          v-model="draft"
          label="Add a note"
          :rows="3"
          :maxlength="20000"
          :hint="add.isError.value ? errorMessage(add.error.value) : undefined"
        />
        <button
          type="submit"
          class="btn btn-outline"
          :disabled="add.isPending.value || !draft.trim()"
        >
          {{ add.isPending.value ? 'Adding…' : 'Add note' }}
        </button>
      </form>
    </template>
  </section>
</template>
