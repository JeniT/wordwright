<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import { api, errorMessage } from '../lib/api'
import { useReadingList } from '../lib/reading'
import { useIdeaNotes } from '../lib/queries'
import LandingSection from './LandingSection.vue'
import NoteCard from './NoteCard.vue'
import TextAreaField from './TextAreaField.vue'
import QueryState from './QueryState.vue'

/**
 * A summary of notes for a landing page: the latest few, a way to jot one down, and a link to all of them. It shares
 * the notes page's query, so a note added here is on the full list at once (and the other way round).
 */
const props = defineProps<{
  publicationId: string
  /** The idea whose notes these are, or null for the publication's own. */
  ideaId: string | null
  /** The notes page this summarises. */
  to: RouteLocationRaw
}>()
const SHOWN = 5

const {
  notes,
  append: appendNote,
  refreshIdea,
} = useIdeaNotes(
  () => props.publicationId,
  () => props.ideaId,
)
const reading = useReadingList(() => ({ publicationId: props.publicationId, ideaId: props.ideaId }))
// "Recent" is when a note was made; the notes page's own order is the writer's.
const recent = computed(() =>
  [...(notes.data.value ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, SHOWN),
)

const draft = ref('')
const add = useMutation({
  mutationFn: () => api.addIdeaNote(props.publicationId, props.ideaId, draft.value),
  onSuccess: async (note) => {
    draft.value = ''
    appendNote(note)
    await refreshIdea()
  },
})
</script>

<template>
  <LandingSection :level="ideaId ? 'idea' : 'publication'" step="notes" title="Notes">
    <template #actions>
      <RouterLink :to="to" class="link text-sm">
        See all notes<span v-if="notes.data.value?.length" class="meta">
          ({{ notes.data.value.length }})</span
        >
      </RouterLink>
    </template>
    <QueryState :query="notes" what="the notes">
      <p v-if="!recent.length" class="mb-4 text-ink-soft">No notes yet.</p>
      <ul v-else class="panel mb-4 divide-y divide-line" aria-label="Recent notes">
        <li v-for="note in recent" :key="note.id" class="flex px-4 py-3">
          <NoteCard :note="note" :reading-list="reading.links.value ?? []" />
        </li>
      </ul>
    </QueryState>
    <form @submit.prevent="add.mutate()">
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
  </LandingSection>
</template>
