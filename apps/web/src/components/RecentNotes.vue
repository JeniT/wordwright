<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import { useReadingList } from '../lib/reading'
import { refineRoute } from '../lib/note-label'
import { useIdeaNotes } from '../lib/queries'
import LandingSection from './LandingSection.vue'
import NoteCard from './NoteCard.vue'
import QueryState from './QueryState.vue'
import RowList from './RowList.vue'

/**
 * A summary of notes for a landing page: the latest few, and a link to all of them (adding is Quick add's job). It shares
 * the notes page's query, so a note added here is on the full list at once (and the other way round).
 */
const props = defineProps<{
  publicationId: string
  /** The idea whose notes these are, or null for the publication's own. */
  ideaId: string | null
  /** The notes page this summarises. */
  to: RouteLocationRaw
  nested?: boolean
  explain?: string
}>()
const SHOWN = 5

const { notes } = useIdeaNotes(
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
</script>

<template>
  <LandingSection
    :level="ideaId ? 'idea' : 'publication'"
    step="notes"
    title="Notes"
    :nested="nested"
    :explain="explain"
  >
    <template #actions>
      <RouterLink :to="to" class="link text-sm"> See all notes </RouterLink>
    </template>
    <QueryState :query="notes" what="the notes">
      <p v-if="!recent.length" class="text-ink-soft">No notes yet.</p>
      <RowList v-else :items="recent" label="Recent notes" bare>
        <template #default="{ item: note }">
          <div class="flex px-4 py-3">
            <NoteCard
              :note="note"
              :reading-list="reading.links.value ?? []"
              :refine-to="refineRoute(publicationId, ideaId)"
            />
          </div>
        </template>
      </RowList>
    </QueryState>
  </LandingSection>
</template>
