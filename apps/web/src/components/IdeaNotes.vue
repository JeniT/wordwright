<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import type { IdeaLink, IdeaNote } from '@wordwright/core'
import { api, errorMessage } from '../lib/api'
import { useIdeaNotes } from '../lib/queries'
import { hasTag, orderWithHidden, tagsUsedOn } from '../lib/note-tags'
import { useMove, useMoveDestination } from '../lib/move'
import BulkTagFields from './BulkTagFields.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import HoldButton from './HoldButton.vue'
import Icon from './Icon.vue'
import ListToolbar from './ListToolbar.vue'
import MoveFields from './MoveFields.vue'
import MoveNotesDetails from './MoveNotesDetails.vue'
import NoteCard from './NoteCard.vue'
import ReorderableList from './ReorderableList.vue'
import TagEditor from './TagEditor.vue'
import TagFilter from './TagFilter.vue'
import TextAreaField from './TextAreaField.vue'
import QueryState from './QueryState.vue'
import { useInlineEdit } from '../lib/inline-edit'
import { vTip } from '../lib/tip'

/** An idea's notes, or (no `ideaId`) the publication's own, gathered before there is an idea. */
const props = defineProps<{
  publicationId: string
  ideaId: string | null
  /** The reading list they were taken from (the idea's, or the publication's), to name each note's source. */
  readingList: readonly IdeaLink[]
  /** The page's own title already says "Notes": keep this heading for screen readers only. */
  quietHeading?: boolean
}>()

const {
  notes,
  set: setNotes,
  append: appendNote,
  refreshIdea: refreshAround,
} = useIdeaNotes(
  () => props.publicationId,
  () => props.ideaId,
)

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
  mutationFn: () => api.addIdeaNote(props.publicationId, props.ideaId, draft.value),
  onSuccess: async (note) => {
    draft.value = ''
    appendNote(note)
    await refreshAround()
    addBox.value?.querySelector('textarea')?.focus()
  },
})

// ---- editing one note at a time
const editText = ref('')
const list = ref<HTMLElement>()
const {
  editing: editingId,
  start,
  stop: stopEditing,
} = useInlineEdit<string>({
  field: (id) => list.value?.querySelector(`[data-edit-note="${id}"] textarea`),
  trigger: (id) => list.value?.querySelector(`[data-edit-button="${id}"]`),
})

function startEditing(note: IdeaNote) {
  save.reset()
  editText.value = note.text
  return start(note.id)
}
const save = useMutation({
  // Only a changed text is sent; tags are set on their own, under each note.
  mutationFn: async (note: IdeaNote) =>
    editText.value.trim() !== note.text
      ? api.updateIdeaNote(props.publicationId, props.ideaId, note.id, editText.value)
      : note,
  onSuccess: async (note) => {
    setNotes((old: IdeaNote[] | undefined) => old?.map((n) => (n.id === note.id ? note : n)))
    await stopEditing()
    await refreshAround()
  },
})

/** Gives a note exactly these tags (one more or one fewer than before, each time the person presses Enter). */
async function saveTags(note: IdeaNote, tags: string[]) {
  const saved = await api.setIdeaNoteTags(props.publicationId, props.ideaId, note.id, tags)
  setNotes((old: IdeaNote[] | undefined) => old?.map((n) => (n.id === saved.id ? saved : n)))
  await refreshAround()
}

// ---- selecting notes for a bulk action (Merge, Move to…, Delete). The tick is always there, in each row's rail.
const selected = ref<string[]>([])
const announcement = ref('')
function clearSelection() {
  selected.value = []
}
// What an action touches is always what is on screen: a new filter clears the selection.
watch(tagFilter, clearSelection)
/** The selected notes that are shown (one that was deleted or filtered away is not counted). */
const chosen = computed(() => visibleNotes.value.filter((n) => selected.value.includes(n.id)))
const chosenIds = computed(() => chosen.value.map((n) => n.id))
function toggleSelected(id: string, on: boolean) {
  selected.value = on ? [...selected.value, id] : selected.value.filter((s) => s !== id)
}
const selectAll = (on: boolean) => (selected.value = on ? visibleNotes.value.map((n) => n.id) : [])

// ---- merging: join the selected notes into one
const canMerge = computed(() => chosen.value.length >= 2 && !chosen.value.some((n) => n.quote))
const mergeHint = computed(() =>
  chosen.value.some((n) => n.quote)
    ? 'Quotations must stay as written, so they can’t be merged.'
    : chosen.value.length < 2
      ? 'Select two or more notes to join into one. It goes where the first of them is.'
      : 'Join the selected notes into one. It goes where the first of them is.',
)
const merge = useMutation({
  mutationFn: () => api.mergeIdeaNotes(props.publicationId, props.ideaId, chosenIds.value),
  onSuccess: async (all) => {
    announcement.value = `Merged ${chosen.value.length} notes into one.`
    setNotes(all)
    clearSelection()
    await refreshAround()
  },
  // The list on screen may be out of date; show the server's.
  onError: () => notes.refetch(),
})

// ---- tagging: add tags to, or take tags off, all the selected notes at once
const tagging = ref(false)
const tagAdd = ref<string[]>([])
const tagRemove = ref<string[]>([])
/** The tags the selected notes carry (each spelled as first met), and on how many. */
const carried = computed(() => {
  const counts = new Map<string, { tag: string; count: number }>()
  for (const note of chosen.value)
    for (const tag of note.tags) {
      const entry = counts.get(tag.toLowerCase())
      if (entry) entry.count++
      else counts.set(tag.toLowerCase(), { tag, count: 1 })
    }
  return [...counts.values()]
})
const tagChosen = useMutation({
  mutationFn: (change: { add: string[]; remove: string[] }) =>
    api.tagIdeaNotes(props.publicationId, props.ideaId, { ids: chosenIds.value, ...change }),
  onSuccess: async (all) => {
    announcement.value = `Tagged ${chosen.value.length} ${chosen.value.length === 1 ? 'note' : 'notes'}.`
    setNotes(all)
    tagging.value = false
    await refreshAround()
  },
})
function toggleTagging() {
  moving.value = false
  tagging.value = !tagging.value
  tagAdd.value = []
  tagRemove.value = []
  tagChosen.reset()
}

// ---- moving: the selected notes go to another idea, a new one, or the publication
const mover = useMove(() => props.publicationId)
const dest = useMoveDestination(
  () => props.publicationId,
  () => props.ideaId,
  'the publication’s notes',
)
const moving = ref(false)
/** A note whose own Move button was pressed: its dialog is open, and it alone moves (whatever is selected). */
const movingOne = ref<IdeaNote | null>(null)
const bringAll = ref(false)
function toggleMoving() {
  tagging.value = false
  moving.value = !moving.value
  bringAll.value = false
  dest.reset()
  mover.moveNotes.reset()
}
function startMovingOne(note: IdeaNote) {
  tagging.value = false
  moving.value = false
  bringAll.value = false
  dest.reset()
  mover.moveNotes.reset()
  movingOne.value = note
}
function stopMovingOne() {
  movingOne.value = null
  bringAll.value = false
  dest.reset()
}
/** The notes a move is about: the one whose button was pressed, else the selected ones. */
const moveSubjects = computed(() => (movingOne.value ? [movingOne.value] : chosen.value))
/** The pages the notes were taken from, and the other notes taken from those pages. */
const sourceIds = computed(() => [
  ...new Set(moveSubjects.value.filter((n) => n.readingItemId).map((n) => n.readingItemId!)),
])
const othersFromSources = computed(() =>
  (notes.data.value ?? []).filter(
    (n) =>
      n.readingItemId &&
      sourceIds.value.includes(n.readingItemId) &&
      !moveSubjects.value.some((s) => s.id === n.id),
  ),
)
const movingIds = computed(() => [
  ...moveSubjects.value.map((n) => n.id),
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
    {
      ids,
      from: props.ideaId,
      to: target.to,
      toPublicationId: target.toPublicationId,
      toName: target.name,
    },
    {
      onSuccess: () => {
        if (!movingOne.value) clearSelection()
        moving.value = false
        movingOne.value = null
        bringAll.value = false
        dest.reset()
      },
    },
  )
}

// ---- the header's form (Tag… or Move to…) and its tick and cross
const formOpen = computed(() => tagging.value || moving.value)
const plural = (n: number) => `${n} ${n === 1 ? 'note' : 'notes'}`
const confirmLabel = computed(() =>
  tagging.value
    ? tagChosen.isPending.value
      ? 'Tagging…'
      : `Tag ${plural(chosen.value.length)}`
    : mover.moveNotes.isPending.value || dest.makeIdea.isPending
      ? 'Moving…'
      : `Move ${plural(movingIds.value.length)}`,
)
const moveLabel = computed(() =>
  mover.moveNotes.isPending.value || dest.makeIdea.isPending
    ? 'Moving…'
    : `Move ${plural(movingIds.value.length)}`,
)
const canConfirm = computed(() =>
  tagging.value
    ? chosen.value.length > 0 &&
      !tagChosen.isPending.value &&
      tagAdd.value.length + tagRemove.value.length > 0
    : canMove.value,
)
function confirmForm() {
  if (tagging.value) tagChosen.mutate({ add: tagAdd.value, remove: tagRemove.value })
  else void moveChosen()
}
function cancelForm() {
  if (tagging.value) toggleTagging()
  else if (moving.value) toggleMoving()
}

// ---- splitting: cut the note being edited where the cursor is
const split = useMutation({
  mutationFn: ({ note, at }: { note: IdeaNote; at: number }) =>
    api.splitIdeaNote(
      props.publicationId,
      props.ideaId,
      note.id,
      editText.value.slice(0, at),
      editText.value.slice(at),
    ),
  onSuccess: async (all) => {
    announcement.value = 'Split the note in two.'
    setNotes(all)
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
  mutationFn: (id: string) => api.removeIdeaNote(props.publicationId, props.ideaId, id),
  onSuccess: async (_, id) => {
    setNotes((old: IdeaNote[] | undefined) => old?.filter((n) => n.id !== id))
    if (editingId.value === id) editingId.value = null
    await refreshAround()
  },
  // The list on screen may be out of date; show the server's.
  onError: () => notes.refetch(),
})

/** Deletes the selected notes, once confirmed in a dialog. Each is tried even if an earlier one failed. */
const confirmingDeleteChosen = ref(false)
const removeChosen = useMutation({
  mutationFn: async (ids: string[]) => {
    const results = await Promise.allSettled(
      ids.map((id) => api.removeIdeaNote(props.publicationId, props.ideaId, id)),
    )
    if (results.some((r) => r.status === 'rejected'))
      throw new Error('Some notes could not be deleted.')
  },
  onSuccess: clearSelection,
  onSettled: async () => {
    confirmingDeleteChosen.value = false
    await notes.refetch() // shows what is left, whatever went wrong
    await refreshAround()
  },
})

// ---- reordering
const move = useMutation({
  mutationFn: (ids: string[]) => api.reorderIdeaNotes(props.publicationId, props.ideaId, ids),
  onSuccess: (saved) => {
    setNotes(saved)
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
      One thought to a note, like index cards. Drag them by the dotted strip, or click it for
      arrows, to put them in order. To delete a note, press and hold its bin.
      <template v-if="!ideaId">
        These notes belong to the publication, not to any one idea yet.
      </template>
    </p>
    <p class="sr-only" aria-live="polite">{{ announcement }}</p>

    <QueryState :query="notes" what="the notes" loading="Loading notes…">
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
        <p v-if="!visibleNotes.length" class="text-ink-soft">No notes have this tag.</p>
        <ReorderableList
          v-else
          :items="visibleNotes"
          :item-label="label"
          :save="saveOrder"
          :keep-toolbar="!!tagFilter"
        >
          <template #toolbar>
            <ListToolbar
              :page-size="visibleNotes.length"
              :total="visibleNotes.length"
              :selected="chosen.length"
              :selected-on-page="chosen.length"
              noun="notes"
              :can-filter="usedTags.length > 0"
              :filter-summary="tagFilter ?? undefined"
              :form-open="formOpen"
              :confirm-label="confirmLabel"
              :can-confirm="canConfirm"
              @toggle-page="selectAll"
              @confirm="confirmForm"
              @cancel="cancelForm"
            >
              <template #filters>
                <TagFilter v-model="tagFilter" :tags="usedTags" class="!mb-0" />
              </template>
              <template #actions>
                <button type="button" class="btn btn-sm btn-neutral" @click="toggleTagging">
                  Tag…
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-neutral"
                  :disabled="!canMerge || merge.isPending.value"
                  :title="mergeHint"
                  @click="merge.mutate()"
                >
                  {{ merge.isPending.value ? 'Merging…' : 'Merge' }}
                </button>
                <button type="button" class="btn btn-sm btn-neutral" @click="toggleMoving">
                  Move to…
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-danger"
                  :disabled="removeChosen.isPending.value"
                  @click="confirmingDeleteChosen = true"
                >
                  Delete {{ chosen.length }}
                </button>
              </template>
              <template #form>
                <BulkTagFields
                  v-if="tagging"
                  v-model:add="tagAdd"
                  v-model:remove="tagRemove"
                  noun="note"
                  :count="chosen.length"
                  :carried="carried"
                  :suggestions="usedTags"
                />
                <template v-else>
                  <MoveFields
                    :dest="dest"
                    :from-idea="!!ideaId"
                    publication-label="The publication’s notes"
                    allow-new
                    new-idea-hint="In your own words. The notes you move become its first notes."
                    explain-label="About moving notes"
                  >
                    They keep the order you arranged them in, along with their tags and whether they
                    are quotations. They are moved, not copied.
                  </MoveFields>
                  <MoveNotesDetails
                    v-if="chosen.length && dest.chosen"
                    v-model:bring-all="bringAll"
                    :count="movingIds.length"
                    :destination="dest.name"
                    :source-count="sourceIds.length"
                    :others-count="othersFromSources.length"
                  />
                </template>
                <p
                  v-if="tagging ? tagChosen.isError.value : mover.moveNotes.isError.value"
                  role="alert"
                  class="mt-1 text-sm text-danger"
                >
                  {{ errorMessage(tagging ? tagChosen.error.value : mover.moveNotes.error.value) }}
                </p>
              </template>
            </ListToolbar>
          </template>
          <template #rail="{ item: note }">
            <!-- With one note and no filter there is no toolbar to act from, so nothing to select for. -->
            <input
              v-if="visibleNotes.length > 1 || tagFilter"
              type="checkbox"
              :checked="selected.includes(note.id)"
              :aria-label="`Select ${label(note)}`"
              @change="toggleSelected(note.id, ($event.target as HTMLInputElement).checked)"
            />
          </template>
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
            <NoteCard v-else :note="note" :reading-list="readingList">
              <template #tags>
                <TagEditor
                  :label="label(note)"
                  :tags="note.tags"
                  :suggestions="usedTags"
                  :save="(tags) => saveTags(note, tags)"
                />
              </template>
            </NoteCard>
          </template>
          <template #actions="{ item: note }">
            <button
              v-if="!note.quote"
              v-tip="'Edit'"
              type="button"
              class="btn btn-sm btn-icon btn-ghost"
              :data-edit-button="note.id"
              :disabled="editingId === note.id"
              :aria-label="`Edit ${label(note)}`"
              @click="startEditing(note)"
            >
              <Icon name="edit" />
            </button>
            <button
              v-tip="'Move'"
              type="button"
              class="btn btn-sm btn-icon btn-ghost"
              :aria-label="`Move ${label(note)}`"
              @click="startMovingOne(note)"
            >
              <Icon name="move" />
            </button>
            <HoldButton
              tip="Press and hold, or tap twice, to delete this note"
              verb="Delete"
              class="btn btn-sm btn-icon btn-ghost btn-ghost-danger"
              :disabled="remove.isPending.value"
              :aria-label="`Delete ${label(note)}`"
              @confirm="remove.mutate(note.id)"
            >
              <Icon name="remove" />
            </HoldButton>
          </template>
        </ReorderableList>
        <p v-if="merge.isError.value" role="alert" class="mt-2 text-danger">
          {{ errorMessage(merge.error.value) }}
        </p>
        <p v-if="removeChosen.isError.value" role="alert" class="mt-2 text-danger">
          Couldn't delete all of those notes. The ones that are left are still selected; please try
          again.
        </p>
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
    </QueryState>
    <ConfirmDialog
      :open="!!movingOne"
      :title="movingOne ? `Move ${label(movingOne)}` : ''"
      :confirm-label="moveLabel"
      confirm-tone="primary"
      :can-confirm="canMove"
      :busy="mover.moveNotes.isPending.value || dest.makeIdea.isPending"
      busy-label="Moving…"
      @confirm="moveChosen"
      @cancel="stopMovingOne"
    >
      <MoveFields
        :dest="dest"
        :from-idea="!!ideaId"
        publication-label="The publication’s notes"
        allow-new
        new-idea-hint="In your own words. The note you move becomes its first note."
        explain-label="About moving a note"
      >
        It keeps its tags and whether it is a quotation. It is moved, not copied.
      </MoveFields>
      <MoveNotesDetails
        v-if="dest.chosen"
        v-model:bring-all="bringAll"
        :count="movingIds.length"
        :destination="dest.name"
        :source-count="sourceIds.length"
        :others-count="othersFromSources.length"
      />
      <p v-if="mover.moveNotes.isError.value" role="alert" class="mt-2 text-danger">
        {{ errorMessage(mover.moveNotes.error.value) }}
      </p>
    </ConfirmDialog>
    <ConfirmDialog
      :open="confirmingDeleteChosen"
      :title="`Delete ${chosen.length} ${chosen.length === 1 ? 'note' : 'notes'}?`"
      confirm-label="Yes, delete them"
      busy-label="Deleting…"
      :busy="removeChosen.isPending.value"
      @confirm="removeChosen.mutate(chosenIds)"
      @cancel="confirmingDeleteChosen = false"
    >
      The selected notes will be deleted from the {{ ideaId ? 'idea' : 'publication' }}. This can't
      be undone.
    </ConfirmDialog>
  </section>
</template>
