<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import type { IdeaLink, IdeaNote } from '@lfwa/core'
import { api, errorMessage } from '../lib/api'
import { useIdeaNotes } from '../lib/queries'
import {
  hasTag,
  orderWithHidden,
  parseTags,
  sameTags,
  tagsToText,
  tagsUsedOn,
} from '../lib/note-tags'
import { useMove, useMoveDestination } from '../lib/move'
import BulkTagPanel from './BulkTagPanel.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import HoldButton from './HoldButton.vue'
import Icon from './Icon.vue'
import ListToolbar from './ListToolbar.vue'
import MoveTo from './MoveTo.vue'
import NoteCard from './NoteCard.vue'
import ReorderableList from './ReorderableList.vue'
import SwitchField from './SwitchField.vue'
import TagFilter from './TagFilter.vue'
import TextAreaField from './TextAreaField.vue'
import TextField from './TextField.vue'
import QueryState from './QueryState.vue'
import { useInlineEdit } from '../lib/inline-edit'

/** An idea's notes, or (no `ideaId`) the profile's own, gathered before there is an idea. */
const props = defineProps<{
  profileId: string
  ideaId: string | null
  /** The reading list they were taken from (the idea's, or the profile's), to name each note's source. */
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
  () => props.profileId,
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
  mutationFn: () => api.addIdeaNote(props.profileId, props.ideaId, draft.value),
  onSuccess: async (note) => {
    draft.value = ''
    appendNote(note)
    await refreshAround()
    addBox.value?.querySelector('textarea')?.focus()
  },
})

// ---- editing one note at a time
const editText = ref('')
const editTags = ref('')
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
  editTags.value = tagsToText(note.tags)
  return start(note.id)
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
    setNotes((old: IdeaNote[] | undefined) => old?.map((n) => (n.id === note.id ? note : n)))
    await stopEditing()
    await refreshAround()
  },
})

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
  mutationFn: () => api.mergeIdeaNotes(props.profileId, props.ideaId, chosenIds.value),
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
    api.tagIdeaNotes(props.profileId, props.ideaId, { ids: chosenIds.value, ...change }),
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
  tagChosen.reset()
}

// ---- moving: the selected notes go to another idea, a new one, or the profile
const mover = useMove(() => props.profileId)
const dest = useMoveDestination(
  () => props.profileId,
  () => props.ideaId,
  'the profile’s notes',
)
const moving = ref(false)
const bringAll = ref(false)
function toggleMoving() {
  tagging.value = false
  moving.value = !moving.value
  bringAll.value = false
  dest.reset()
  mover.moveNotes.reset()
}
/** The pages the chosen notes were taken from, and the other notes taken from those pages. */
const sourceIds = computed(() => [
  ...new Set(chosen.value.filter((n) => n.readingItemId).map((n) => n.readingItemId!)),
])
const othersFromSources = computed(() =>
  (notes.data.value ?? []).filter(
    (n) =>
      n.readingItemId &&
      sourceIds.value.includes(n.readingItemId) &&
      !chosenIds.value.includes(n.id),
  ),
)
const movingIds = computed(() => [
  ...chosenIds.value,
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
        clearSelection()
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
  mutationFn: (id: string) => api.removeIdeaNote(props.profileId, props.ideaId, id),
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
      ids.map((id) => api.removeIdeaNote(props.profileId, props.ideaId, id)),
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
  mutationFn: (ids: string[]) => api.reorderIdeaNotes(props.profileId, props.ideaId, ids),
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
        These notes belong to the profile, not to any one idea yet.
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
        <ReorderableList v-else :items="visibleNotes" :item-label="label" :save="saveOrder">
          <template #toolbar>
            <ListToolbar
              :page-size="visibleNotes.length"
              :total="visibleNotes.length"
              :selected="chosen.length"
              :selected-on-page="chosen.length"
              noun="notes"
              @toggle-page="selectAll"
            >
              <template #filters>
                <TagFilter v-model="tagFilter" :tags="usedTags" class="!mb-0" />
              </template>
              <template #actions>
                <button
                  type="button"
                  class="btn btn-sm btn-neutral"
                  :disabled="!canMerge || merge.isPending.value"
                  :title="mergeHint"
                  @click="merge.mutate()"
                >
                  {{ merge.isPending.value ? 'Merging…' : 'Merge' }}
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-neutral"
                  :aria-expanded="tagging"
                  :disabled="!chosen.length && !tagging"
                  @click="toggleTagging"
                >
                  Tag…
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-neutral"
                  :aria-expanded="moving"
                  :disabled="!chosen.length && !moving"
                  @click="toggleMoving"
                >
                  Move to…
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-danger"
                  :disabled="!chosen.length || removeChosen.isPending.value"
                  :title="chosen.length ? undefined : 'Select notes to delete them'"
                  @click="confirmingDeleteChosen = true"
                >
                  Delete{{ chosen.length ? ` ${chosen.length}` : '' }}
                </button>
              </template>
            </ListToolbar>
            <BulkTagPanel
              v-if="tagging"
              noun="note"
              :count="chosen.length"
              :carried="carried"
              :suggestions="usedTags"
              :pending="tagChosen.isPending.value"
              :error="tagChosen.isError.value ? errorMessage(tagChosen.error.value) : undefined"
              @apply="tagChosen.mutate($event)"
              @cancel="toggleTagging"
            />
            <form
              v-if="moving"
              class="border-b border-line bg-sunken p-3"
              aria-label="Move the chosen notes"
              @submit.prevent="moveChosen"
            >
              <p class="mb-2 text-sm text-ink-soft">
                They keep the order you arranged them in, along with their tags and whether they are
                quotations. They are moved, not copied.
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
              <p v-if="chosen.length && dest.chosen" class="mb-3 text-sm" data-move-says>
                {{ movingIds.length }} {{ movingIds.length === 1 ? 'note' : 'notes' }} will move to
                {{ dest.name }}.
                <template v-if="sourceIds.length">
                  {{ sourceIds.length === 1 ? 'The page' : `The ${sourceIds.length} pages` }} they
                  were taken from will be copied to its reading list (or the copy already there is
                  used); the originals stay where they are.
                </template>
              </p>
              <div v-if="othersFromSources.length" class="mb-3">
                <SwitchField
                  v-model="bringAll"
                  :label="`Also bring the ${othersFromSources.length} other ${othersFromSources.length === 1 ? 'note' : 'notes'} taken from those pages`"
                />
                <p class="meta">Otherwise they stay here, still pointing at the pages here.</p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <button type="submit" class="btn btn-sm btn-primary" :disabled="!canMove">
                  {{
                    mover.moveNotes.isPending.value || dest.makeIdea.isPending
                      ? 'Moving…'
                      : `Move ${movingIds.length} ${movingIds.length === 1 ? 'note' : 'notes'}`
                  }}
                </button>
                <button type="button" class="btn btn-sm btn-neutral" @click="toggleMoving">
                  Cancel
                </button>
              </div>
              <p v-if="mover.moveNotes.isError.value" role="alert" class="mt-2 text-sm text-danger">
                {{ errorMessage(mover.moveNotes.error.value) }}
              </p>
            </form>
          </template>
          <template #rail="{ item: note }">
            <input
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
            <NoteCard v-else :note="note" :reading-list="readingList" />
          </template>
          <template #actions="{ item: note }">
            <button
              v-if="!note.quote"
              type="button"
              class="btn btn-sm btn-icon btn-quiet"
              :data-edit-button="note.id"
              :disabled="editingId === note.id"
              title="Edit"
              :aria-label="`Edit ${label(note)}`"
              @click="startEditing(note)"
            >
              <Icon name="edit" />
            </button>
            <HoldButton
              verb="Delete"
              class="btn btn-sm btn-icon btn-quiet hover:border-danger hover:bg-danger-wash hover:text-danger"
              :disabled="remove.isPending.value"
              title="Press and hold, or tap twice, to delete this note"
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
      :open="confirmingDeleteChosen"
      :title="`Delete ${chosen.length} ${chosen.length === 1 ? 'note' : 'notes'}?`"
      confirm-label="Yes, delete them"
      busy-label="Deleting…"
      :busy="removeChosen.isPending.value"
      @confirm="removeChosen.mutate(chosenIds)"
      @cancel="confirmingDeleteChosen = false"
    >
      The selected notes will be deleted from the {{ ideaId ? 'idea' : 'profile' }}. This can't be
      undone.
    </ConfirmDialog>
  </section>
</template>
