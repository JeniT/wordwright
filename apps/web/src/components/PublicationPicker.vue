<script setup lang="ts">
import type { Publication } from '@wordwright/core'

/** Quick add's "Add to publication" choice, shown at the top of whichever form is open (only with several). */
defineProps<{ publications: Publication[]; selectedId: string; disabled?: boolean }>()
defineEmits<{ change: [event: Event] }>()
</script>

<template>
  <div v-if="publications.length > 1" class="mb-4">
    <label for="quick-add-publication" class="mb-1 block text-sm font-medium"
      >Add to publication</label
    >
    <select
      id="quick-add-publication"
      class="field"
      :value="selectedId"
      :disabled="disabled"
      @change="$emit('change', $event)"
    >
      <option v-for="p in publications" :key="p.id" :value="p.id">{{ p.name }}</option>
    </select>
  </div>
</template>
