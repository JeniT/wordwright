<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { api } from '../lib/api'
import { originWords } from '../lib/note-label'
import { stillInDraft } from '../lib/note-insert'

const props = defineProps<{ profileId: string; draftId: string; body: string }>()

const insertions = useQuery({
  queryKey: ['draft-insertions', () => props.profileId, () => props.draftId],
  queryFn: () => api.listDraftInsertions(props.profileId, props.draftId),
})
const rows = computed(() =>
  (insertions.data.value ?? []).map((i) => ({
    ...i,
    words: originWords(i.origin, i.noteAuthorName, i.source),
    kept: stillInDraft(props.body, i.text),
  })),
)
</script>

<template>
  <details v-if="rows.length" class="mt-6 rounded border border-stone-200 bg-white p-3 text-sm">
    <summary class="cursor-pointer font-medium">
      Where some of the words came from ({{ rows.length }})
    </summary>
    <p class="mt-2 text-stone-700">
      Words you pulled in from notes keep a record of where they came from, even after you change
      them.
    </p>
    <ul class="mt-2 space-y-2">
      <li v-for="row in rows" :key="row.id" class="border-t border-stone-200 pt-2">
        <p class="break-words">
          “{{ row.text.length > 120 ? `${row.text.slice(0, 120)}…` : row.text }}”
        </p>
        <p class="text-xs text-stone-600">
          {{ row.words }} ·
          <span :class="row.kept ? '' : 'font-medium text-amber-900'">{{
            row.kept ? 'Still as inserted' : 'Edited or removed since'
          }}</span>
        </p>
      </li>
    </ul>
  </details>
</template>
