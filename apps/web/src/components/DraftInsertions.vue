<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { api } from '../lib/api'
import { originPhrase } from '../lib/note-label'
import Explain from './Explain.vue'
import NoteOrigin from './NoteOrigin.vue'
import { stillInDraft } from '../lib/note-insert'

const props = defineProps<{ publicationId: string; draftId: string; body: string }>()

const insertions = useQuery({
  queryKey: ['draft-insertions', () => props.publicationId, () => props.draftId],
  queryFn: () => api.listDraftInsertions(props.publicationId, props.draftId),
})
/** An option the writer used says what they asked for; the chip is who used it, not who wrote a note. */
const rows = computed(() =>
  (insertions.data.value ?? []).map((i) => ({
    ...i,
    source: i.origin === 'option' ? null : i.source,
    words:
      i.origin === 'option'
        ? `${i.option?.kind === 'title' ? 'A title' : 'Words'} that began as an AI option, for “${i.option?.aim ?? ''}”`
        : originPhrase(i.origin, i.source),
    by: i.origin === 'option' ? i.insertedByName : i.noteAuthorName,
    // A title is not part of the body, so it is not looked for there.
    kept: i.option?.kind === 'title' ? null : stillInDraft(props.body, i.text),
  })),
)
</script>

<template>
  <details v-if="rows.length" class="mt-6 rounded-ctl border border-line bg-surface p-3 text-sm">
    <summary class="cursor-pointer font-medium">
      Where some of the words came from ({{ rows.length }})
    </summary>
    <Explain label="About this record" class="mt-2">
      Words you pulled in from notes, or took from an AI option, keep a record of where they came
      from, even after you change them.
    </Explain>
    <ul class="mt-2 space-y-2">
      <li v-for="row in rows" :key="row.id" class="border-t border-line pt-2">
        <p class="break-words">
          “{{ row.text.length > 120 ? `${row.text.slice(0, 120)}…` : row.text }}”
        </p>
        <p class="text-xs text-ink-soft">
          <NoteOrigin :phrase="row.words" :source="row.source" :author-name="row.by" />
          <template v-if="row.kept !== null">
            ·
            <span :class="row.kept ? '' : 'font-medium text-accent-strong'">{{
              row.kept ? 'Still as inserted' : 'Edited or removed since'
            }}</span>
          </template>
        </p>
      </li>
    </ul>
  </details>
</template>
