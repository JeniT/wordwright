<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, nextTick, ref, watch } from 'vue'
import type { IdeaLink, IdeaNote } from '@lfwa/core'
import { api, errorMessage } from '../lib/api'
import { noteOriginPhrase } from '../lib/note-label'
import {
  hasTag,
  orderWithHidden,
  parseTags,
  sameTags,
  tagsToText,
  tagsUsedOn,
} from '../lib/note-tags'
import { useMove, useMoveDestination } from '../lib/move'
import HoldButton from './HoldButton.vue'
import MoveTo from './MoveTo.vue'
import NoteOrigin from './NoteOrigin.vue'
import NoteText from './NoteText.vue'
import NoteTags from './NoteTags.vue'
import ReorderableList from './ReorderableList.vue'
import TagFilter from './TagFilter.vue'
import TextAreaField from './TextAreaField.vue'
import TextField from './TextField.vue'

/** An idea's notes, or (no `ideaId`) the profile's own, gathered before there is an idea. */
const props = defineProps<{
  profileId: string
  ideaId: string | null
  /** The reading list they were taken from (the idea's, or the profile's), to name each note's source. */
  readingList: readonly IdeaLink[]
  /** The page's own title already says "Notes": keep this heading for screen readers only. */
  quietHeading?: boolean
}>()
const queryClient = useQueryClient()

const notesKey = () => ['notes', props.profileId, props.ideaId ?? 'profile']
const notes = useQuery({
  queryKey: ['notes', () => props.profileId, () => props.ideaId ?? 'profile'],
  queryFn: () => api.listIdeaNotes(props.profileId, props.ideaId),
})

/**
 * A change to an idea's notes also changes the idea's "last changed" time, and its text as brainstorming sees it.
 * The profile's own notes belong to no idea, so nothing else shows them.
 */
const refreshAround = () =>
  props.ideaId
    ? Promise.all([
        queryClient.invalidateQueries({ queryKey: ['idea', props.profileId, props.ideaId] }),
        queryClient.invalidateQueries({ queryKey: ['ideas'] }),
      ])
    : Promise.resolve()

// ---- tags: a flat label on a note, and showing only the notes with one
const usedTags = computed(() => tagsUsedOn(notes.data.value ?? []))
const tagFilter = ref<string | null>(null)
// A tag that no note has any more can't be what is shown.
watch(usedTags, (tags) => {
  if (tagFilter.value && !tags.some((t) => t.toLowerCase() === tagFilter.value!.toLowerCase())) {
    tagFilter.value = null
  }
})
const visibleNotes = computed(() =>
  (notes.data.value ?? []).filter((n) => hasTag(n, tagFilter.value)),
)

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
const editTags = ref('')
const list = ref<HTMLElement>()

async function startEditing(note: IdeaNote) {
  save.reset()
  editText.value = note.text
  editTags.value = tagsToText(note.tags)
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
  // Only what changed is sent: the text, and the tags as a whole set.
  mutationFn: async (note: IdeaNote) => {
    let saved = note
    if (editText.value.trim() !== note.text) {
      saved = await api.updateIdeaNote(props.profileId, props.ideaId, note.id, editText.value)
    }
    const tags = parseTags(editTags.value)
    if (!sameTags(tags, note.tags)) {
      saved = await api.setIdeaNoteTags(props.profileId, props.ideaId, note.id, tags)
    }
    return saved
  },
  onSuccess: async (note) => {
    queryClient.setQueryData(notesKey(), (old: IdeaNote[] | undefined) =>
      old?.map((n) => (n.id === note.id ? note : n)),
    )
    await stopEditing()
    await refreshAround()
  },
})

// ---- merging: choose some notes, join them into one
const selecting = ref(false)
const selected = ref<string[]>([])
const announcement = ref('')
function toggleSelecting() {
  selecting.value = !selecting.value
  selected.value = []
  moving.value = false
  merge.reset()
}
function toggleSelected(id: string, on: boolean) {
  selected.value = on ? [...selected.value, id] : selected.value.filter((s) => s !== id)
}
const merge = useMutation({
  mutationFn: () => api.mergeIdeaNotes(props.profileId, props.ideaId, selected.value),
  onSuccess: async (all) => {
    announcement.value = `Merged ${selected.value.length} notes into one.`
    queryClient.setQueryData(notesKey(), all)
    selecting.value = false
    selected.value = []
    await refreshAround()
  },
  // The list on screen may be out of date; show the server's.
  onError: () => notes.refetch(),
})

// ---- moving: choose notes and where they go (another idea, a new one, or the profile)
const mover = useMove(() => props.profileId)
const dest = useMoveDestination(
  () => props.profileId,
  () => props.ideaId,
  'the profile’s notes',
)
const moving = ref(false)
const movingSelected = ref<string[]>([])
const bringAll = ref(false)
function toggleMoving() {
  moving.value = !moving.value
  movingSelected.value = []
  bringAll.value = false
  selecting.value = false
  selected.value = []
  dest.reset()
  mover.moveNotes.reset()
}
function toggleMovingSelected(id: string, on: boolean) {
  movingSelected.value = on
    ? [...movingSelected.value, id]
    : movingSelected.value.filter((s) => s !== id)
}
const allShownSelected = computed(
  () =>
    visibleNotes.value.length > 0 &&
    visibleNotes.value.every((n) => movingSelected.value.includes(n.id)),
)
/** Ticks every note being shown (so with a tag chosen, those with it), or clears them. */
function toggleAllShown() {
  const shown = visibleNotes.value.map((n) => n.id)
  movingSelected.value = allShownSelected.value
    ? movingSelected.value.filter((id) => !shown.includes(id))
    : [...new Set([...movingSelected.value, ...shown])]
}
/** The pages the chosen notes were taken from, and the other notes taken from those pages. */
const sourceIds = computed(() => [
  ...new Set(
    (notes.data.value ?? [])
      .filter((n) => movingSelected.value.includes(n.id) && n.readingItemId)
      .map((n) => n.readingItemId!),
  ),
])
const othersFromSources = computed(() =>
  (notes.data.value ?? []).filter(
    (n) =>
      n.readingItemId &&
      sourceIds.value.includes(n.readingItemId) &&
      !movingSelected.value.includes(n.id),
  ),
)
const movingIds = computed(() => [
  ...movingSelected.value,
  ...(bringAll.value ? othersFromSources.value.map((n) => n.id) : []),
])
const canMove = computed(
  () =>
    movingIds.value.length > 0 &&
    dest.chosen &&
    !mover.moveNotes.isPending.value &&
    !dest.makeIdea.isPending,
)
async function moveChosen() {
  const ids = movingIds.value
  const target = await dest.resolve()
  if (!target) return
  mover.moveNotes.mutate(
    { ids, from: props.ideaId, to: target.to, toName: target.name },
    {
      onSuccess: () => {
        moving.value = false
        movingSelected.value = []
        bringAll.value = false
        dest.reset()
      },
    },
  )
}

// ---- splitting: cut the note being edited where the cursor is
const split = useMutation({
  mutationFn: ({ note, at }: { note: IdeaNote; at: number }) =>
    api.splitIdeaNote(
      props.profileId,
      props.ideaId,
      note.id,
      editText.value.slice(0, at),
      editText.value.slice(at),
    ),
  onSuccess: async (all) => {
    announcement.value = 'Split the note in two.'
    queryClient.setQueryData(notesKey(), all)
    editingId.value = null
    await refreshAround()
  },
  onError: () => notes.refetch(),
})
function splitHere(note: IdeaNote) {
  const box = list.value?.querySelector<HTMLTextAreaElement>(
    `[data-edit-note="${note.id}"] textarea`,
  )
  const at = box?.selectionStart ?? 0
  split.mutate({ note, at })
}

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
  onSuccess: (saved) => {
    queryClient.setQueryData(notesKey(), saved)
    void refreshAround() // in the background: nothing about the order waits on it
  },
  // The 409 says the list on screen is out of date; show the server's.
  onError: () => notes.refetch(),
})
/** Saves a new order; true if it was saved (the error is shown under the list). */
async function saveOrder(ids: string[]) {
  // While only some notes are shown, the ones that are hidden keep their places.
  const all = (notes.data.value ?? []).map((n) => n.id)
  const complete = orderWithHidden(
    all,
    visibleNotes.value.map((n) => n.id),
    ids,
  )
  try {
    await move.mutateAsync(complete)
  } catch {
    return false
  }
  return true
}

/** A short name for a note, for button labels and announcements. */
const label = (note: IdeaNote) => {
  const first = note.text.split('\n', 1)[0]!
  return `note “${first.length > 40 ? `${first.slice(0, 40)}…` : first}”`
}
</script>

<template>
  <section aria-labelledby="notes-heading" class="mb-10">
    <h2
      id="notes-heading"
      class="mb-1 font-display text-xl font-semibold"
      :class="{ 'sr-only': quietHeading }"
    >
      Notes
    </h2>
    <p class="mb-3 text-sm text-ink-soft">
      One thought to a note, like index cards. Drag them by the grip, or press it for arrows, to put
      them in order. To delete a note, press and hold its Delete button.
      <template v-if="!ideaId">
        These notes belong to the profile, not to any one idea yet.
      </template>
    </p>
    <p class="sr-only" aria-live="polite">{{ announcement }}</p>

    <p v-if="notes.isPending.value">Loading notes…</p>
    <div v-else-if="notes.isError.value" role="alert" class="mb-4">
      <p class="text-danger">We couldn't load the notes.</p>
      <button type="button" class="btn btn-outline mt-2" @click="notes.refetch()">Try again</button>
    </div>
    <template v-else>
      <div
        v-if="mover.outcome.value"
        role="status"
        class="callout callout-ok mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
      >
        <span>{{ mover.outcome.value.text }}</span>
        <button
          v-if="mover.outcome.value.undo"
          type="button"
          class="btn btn-sm btn-neutral"
          :disabled="mover.undoNotes.isPending.value"
          @click="mover.outcome.value.undo()"
        >
          Undo
        </button>
        <button type="button" class="underline" @click="mover.dismiss()">Dismiss</button>
      </div>
      <p v-if="mover.undoNotes.isError.value" role="alert" class="mb-3 text-sm text-danger">
        {{ errorMessage(mover.undoNotes.error.value) }}
      </p>
      <p v-if="!notes.data.value?.length" class="mb-4 text-ink-soft">
        No notes yet. Jot down your first thought below.
      </p>
      <div v-else ref="list" class="mb-4">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <button
            v-if="notes.data.value.length > 1"
            type="button"
            class="btn btn-sm btn-neutral"
            :aria-pressed="selecting"
            @click="toggleSelecting"
          >
            {{ selecting ? 'Stop merging' : 'Merge notes' }}
          </button>
          <button
            type="button"
            class="btn btn-sm btn-neutral"
            :aria-pressed="moving"
            @click="toggleMoving"
          >
            {{ moving ? 'Stop moving' : 'Move notes' }}
          </button>
          <template v-if="selecting">
            <button
              type="button"
              class="btn btn-sm btn-primary"
              :disabled="selected.length < 2 || merge.isPending.value"
              @click="merge.mutate()"
            >
              {{ merge.isPending.value ? 'Merging…' : `Merge ${selected.length} notes` }}
            </button>
            <p class="w-full text-sm text-ink-soft">
              Tick the notes to join into one; it goes where the first of them is. Notes from
              different places, and quotations (which must stay as written), can't be merged.
            </p>
          </template>
        </div>
        <p v-if="merge.isError.value" role="alert" class="mb-3 text-danger">
          {{ errorMessage(merge.error.value) }}
        </p>
        <form
          v-if="moving"
          class="panel-sunken mb-3 p-3"
          aria-label="Move the chosen notes"
          @submit.prevent="moveChosen"
        >
          <p class="mb-2 text-sm text-ink-soft">
            Tick the notes to move, in any order: they keep the order you arranged them in, along
            with their tags and whether they are quotations. They are moved, not copied.
          </p>
          <p class="mb-3">
            <button type="button" class="btn btn-sm btn-neutral" @click="toggleAllShown">
              {{ allShownSelected ? 'Clear the notes shown' : 'Select all the notes shown' }}
            </button>
          </p>
          <MoveTo
            v-model:destination="dest.destination"
            v-model:new-idea-name="dest.newIdeaName"
            :dest="dest"
            :from-idea="!!ideaId"
            profile-label="The profile’s notes"
            allow-new
            new-idea-hint="In your own words. The notes you move become its first notes."
          />
          <p v-if="movingSelected.length && dest.chosen" class="mb-3 text-sm" data-move-says>
            {{ movingIds.length }} {{ movingIds.length === 1 ? 'note' : 'notes' }} will move to
            {{ dest.name }}.
            <template v-if="sourceIds.length">
              {{ sourceIds.length === 1 ? 'The page' : `The ${sourceIds.length} pages` }} they were
              taken from will be copied to its reading list (or the copy already there is used); the
              originals stay where they are.
            </template>
          </p>
          <label v-if="othersFromSources.length" class="mb-3 flex items-start gap-2 text-sm">
            <input v-model="bringAll" type="checkbox" class="mt-0.5 size-4 accent-accent" />
            <span>
              Also bring the {{ othersFromSources.length }} other
              {{ othersFromSources.length === 1 ? 'note' : 'notes' }} taken from those pages.
              <span class="block text-ink-soft">
                Otherwise they stay here, still pointing at the pages here.
              </span>
            </span>
          </label>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="!canMove">
            {{
              mover.moveNotes.isPending.value || dest.makeIdea.isPending
                ? 'Moving…'
                : `Move ${movingIds.length} ${movingIds.length === 1 ? 'note' : 'notes'}`
            }}
          </button>
          <p v-if="mover.moveNotes.isError.value" role="alert" class="mt-2 text-sm text-danger">
            {{ errorMessage(mover.moveNotes.error.value) }}
          </p>
        </form>
        <TagFilter v-model="tagFilter" :tags="usedTags" />
        <p v-if="!visibleNotes.length" class="text-ink-soft">No notes have this tag.</p>
        <ReorderableList v-else :items="visibleNotes" :item-label="label" :save="saveOrder">
          <template #default="{ item: note }">
            <form
              v-if="editingId === note.id"
              :data-edit-note="note.id"
              class="min-w-[12rem] flex-1"
              @submit.prevent="save.mutate(note)"
              @keydown.esc="stopEditing"
            >
              <TextAreaField
                v-model="editText"
                :label="`Text of ${label(note)}`"
                :rows="4"
                :maxlength="20000"
                :hint="save.isError.value ? errorMessage(save.error.value) : undefined"
              />
              <p class="mb-4 -mt-2 text-sm text-ink-soft">
                To cut this note in two, put the cursor where it should be cut and press
                <button
                  type="button"
                  class="underline"
                  :disabled="split.isPending.value || save.isPending.value"
                  :aria-label="`Split ${label(note)} at the cursor`"
                  @click="splitHere(note)"
                >
                  Split here</button
                >.
              </p>
              <p v-if="split.isError.value" role="alert" class="mb-3 text-danger">
                {{ errorMessage(split.error.value) }}
              </p>
              <TextField
                v-model="editTags"
                :label="`Tags for ${label(note)}`"
                autocomplete="off"
                hint="Separate tags with commas, for example: intro, part 2. Use the same word on other notes to group them."
              />
              <p v-if="usedTags.length" class="mb-4 -mt-2 text-xs text-ink-soft">
                Already used:
                <button
                  v-for="tag in usedTags"
                  :key="tag"
                  type="button"
                  class="mr-1 underline"
                  :aria-label="`Add the tag ${tag}`"
                  @click="editTags = tagsToText(parseTags(`${editTags}, ${tag}`))"
                >
                  {{ tag }}
                </button>
              </p>
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
            <div v-else class="min-w-[12rem] flex-1">
              <label v-if="moving" class="mb-1 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  class="size-4 accent-accent"
                  :checked="movingSelected.includes(note.id)"
                  :aria-label="`Select ${label(note)} to move`"
                  @change="
                    toggleMovingSelected(note.id, ($event.target as HTMLInputElement).checked)
                  "
                />
                Move this one
              </label>
              <label v-if="selecting && !note.quote" class="mb-1 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  class="size-4 accent-accent"
                  :checked="selected.includes(note.id)"
                  :aria-label="`Select ${label(note)} to merge`"
                  @change="toggleSelected(note.id, ($event.target as HTMLInputElement).checked)"
                />
                Merge this one
              </label>
              <NoteText :note="note" />
              <NoteTags :tags="note.tags" />
              <p class="mt-1 text-xs text-ink-soft">
                <NoteOrigin
                  :phrase="noteOriginPhrase(note, readingList)"
                  :author-name="note.authorName"
                />
              </p>
            </div>
          </template>
          <template #actions="{ item: note }">
            <button
              v-if="!note.quote"
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
        <p v-if="move.isError.value" role="alert" class="mt-2 text-danger">
          {{ errorMessage(move.error.value) }}
        </p>
        <p v-if="remove.isError.value" role="alert" class="mt-2 text-danger">
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
