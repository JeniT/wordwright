<script setup lang="ts">
import type { IdeaNote } from '@wordwright/core'

defineProps<{ note: Pick<IdeaNote, 'text' | 'quote'> }>()
</script>

<template>
  <!-- A direct quotation is set apart by a quote mark; the blockquote tells a screen reader. -->
  <blockquote v-if="note.quote" class="flex items-start gap-1.5 text-ink italic">
    <span class="quote-mark" aria-hidden="true">“</span>
    <p class="min-w-0 flex-1 whitespace-pre-wrap break-words">{{ note.text }}</p>
  </blockquote>
  <p v-else class="whitespace-pre-wrap break-words">{{ note.text }}</p>
</template>
