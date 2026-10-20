<script setup lang="ts">
import type { RecordedNote } from '@wordwright/core'
import Icon from './Icon.vue'

defineProps<{ notes: readonly RecordedNote[] }>()

/** What became of a point the AI tried to record, for the line shown under its message. */
function say(note: RecordedNote) {
  if (note.outcome === 'duplicate') return 'Already in your notes'
  if (note.outcome === 'full') return "Couldn't add (this idea has as many notes as it can hold)"
  return note.removed ? 'Noted, then deleted' : 'Added to your notes'
}
</script>

<template>
  <ul v-if="notes.length" aria-label="Notes recorded in this reply" class="space-y-1 text-sm">
    <li v-for="note in notes" :key="note.id" class="flex gap-2 text-ink">
      <Icon name="edit" class="mt-0.5 shrink-0" />
      <span class="min-w-0 break-words">
        <span class="font-medium">{{ say(note) }}:</span>
        <span :class="{ 'text-ink-soft': note.outcome !== 'added' || note.removed }">
          “{{ note.text }}”
        </span>
      </span>
    </li>
  </ul>
</template>
