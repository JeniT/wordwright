<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import type { IdeaNote } from '@lfwa/core'
import { api, errorMessage } from '../lib/api'
import NoteText from './NoteText.vue'
import TextAreaField from './TextAreaField.vue'

/**
 * A summary of notes for a landing page: the latest few, a way to jot one down, and a link to all of them. It shares
 * the notes page's query, so a note added here is on the full list at once (and the other way round).
 */
const props = defineProps<{
  profileId: string
  /** The idea whose notes these are, or null for the profile's own. */
  ideaId: string | null
  /** The notes page this summarises. */
  to: RouteLocationRaw
  /** The id of the section heading, so each page that shows this has a unique one. */
  headingId: string
}>()
const SHOWN = 5

const queryClient = useQueryClient()
const key = () => ['notes', props.profileId, props.ideaId ?? 'profile']
const notes = useQuery({
  queryKey: ['notes', () => props.profileId, () => props.ideaId ?? 'profile'],
  queryFn: () => api.listIdeaNotes(props.profileId, props.ideaId),
})
// "Recent" is when a note was made; the notes page's own order is the writer's.
const recent = computed(() =>
  [...(notes.data.value ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, SHOWN),
)

const draft = ref('')
const add = useMutation({
  mutationFn: () => api.addIdeaNote(props.profileId, props.ideaId, draft.value),
  onSuccess: async (note) => {
    draft.value = ''
    queryClient.setQueryData(key(), (old: IdeaNote[] | undefined) => [...(old ?? []), note])
    // An idea's notes also change when it was last changed, and what brainstorming sees.
    if (props.ideaId) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['idea', props.profileId, props.ideaId] }),
        queryClient.invalidateQueries({ queryKey: ['ideas'] }),
      ])
    }
  },
})
</script>

<template>
  <section :aria-labelledby="headingId" class="mb-10">
    <div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
      <h2 :id="headingId" class="font-display text-xl font-semibold">Notes</h2>
      <RouterLink :to="to" class="link text-sm">
        See all notes<span v-if="notes.data.value?.length" class="meta">
          ({{ notes.data.value.length }})</span
        >
      </RouterLink>
    </div>
    <p v-if="notes.isPending.value" class="text-ink-soft">Loading…</p>
    <p v-else-if="notes.isError.value" role="alert" class="text-danger">
      Couldn't load the notes. Try reloading the page.
    </p>
    <p v-else-if="!recent.length" class="mb-4 text-ink-soft">No notes yet.</p>
    <ul v-else class="panel mb-4 divide-y divide-line" aria-label="Recent notes">
      <li v-for="note in recent" :key="note.id" class="px-4 py-3">
        <NoteText :note="note" />
      </li>
    </ul>
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
  </section>
</template>
