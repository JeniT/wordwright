<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { Article, IdeaNote } from '@wordwright/core'
import { api, errorMessage } from '../lib/api'
import { refreshNotesEverywhere, useIdeaNotes } from '../lib/queries'
import { NOTE_DRAG_TYPE } from '../lib/note-drag'
import { noteOrigin, refineRoute } from '../lib/note-label'
import { useSessionStore } from '../stores/session'
import DraftCard from './DraftCard.vue'
import NoteOrigin from './NoteOrigin.vue'
import NoteText from './NoteText.vue'
import { tagsUsedOn, useTagFilter } from '../lib/note-tags'
import NoteTags from './NoteTags.vue'
import TagFilter from './TagFilter.vue'
import QueryState from './QueryState.vue'
import SwitchField from './SwitchField.vue'

const session = useSessionStore()
const props = defineProps<{
  publicationId: string
  ideaId: string
  articleList: readonly Article[]
  /** Puts the note in the draft and saves it; rejects (with a message) if that didn't work. */
  insert: (note: IdeaNote) => Promise<void>
  /** The person may add notes to the draft (only the draft's editor may). */
  canAdd: boolean
}>()
const refineTo = computed(() => refineRoute(props.publicationId, props.ideaId))
const queryClient = useQueryClient()

const { notes } = useIdeaNotes(
  () => props.publicationId,
  () => props.ideaId,
)
const usedTags = computed(() => tagsUsedOn((notes.data.value ?? []).filter((n) => !n.addedAt)))
const { chosen: tagFilter, matches: matchesTags } = useTagFilter(usedTags)
const waiting = computed(() => (notes.data.value ?? []).filter((n) => !n.addedAt && matchesTags(n)))
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
        {{ tagFilter.length ? 'No notes have all these tags.' : 'All your notes are in a draft.' }}
      </p>

      <ul v-if="waiting.length" aria-label="Notes to add" class="mb-3 space-y-2">
        <DraftCard
          v-for="note in waiting"
          :key="note.id"
          :can-add="canAdd"
          :drag="{ type: NOTE_DRAG_TYPE, id: note.id }"
          :label="label(note)"
          :busy="adding.isPending.value && adding.variables.value?.id === note.id"
          @add="adding.mutate(note)"
        >
          <NoteText :note="note" />
          <NoteTags :tags="note.tags" />
          <p class="mt-1 text-xs text-ink-soft">
            <NoteOrigin
              v-bind="noteOrigin(note, articleList, session.user?.id ?? null, refineTo)"
              :author-name="note.authorName"
            />
          </p>
        </DraftCard>
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
            <NoteTags :tags="note.tags" />
            <p class="mt-1 text-xs text-ink-soft">
              <NoteOrigin
                v-bind="noteOrigin(note, articleList, session.user?.id ?? null, refineTo)"
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
