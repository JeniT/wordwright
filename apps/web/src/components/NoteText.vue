<script setup lang="ts">
import type { IdeaNote } from '@lfwa/core'

defineProps<{ note: Pick<IdeaNote, 'text' | 'quote'> }>()
</script>

<template>
  <!-- A direct quotation is set apart, as it will be in the draft. -->
  <blockquote v-if="note.quote" class="border-l-4 border-stone-300 pl-3 text-stone-800 italic">
    <p class="whitespace-pre-wrap break-words">{{ note.text }}</p>
  </blockquote>
  <p v-else class="whitespace-pre-wrap break-words">{{ note.text }}</p>
</template>
