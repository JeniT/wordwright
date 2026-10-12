<script setup lang="ts">
/** Shows only the notes (or other items) with one tag. Not shown at all until something has a tag. */
defineProps<{ tags: readonly string[]; noun?: string }>()
const selected = defineModel<string | null>({ default: null })
</script>

<template>
  <div
    v-if="tags.length"
    role="group"
    :aria-label="`Show ${noun ?? 'notes'} with a tag`"
    class="mb-3 flex flex-wrap gap-1"
  >
    <button
      type="button"
      class="btn btn-sm btn-neutral"
      :class="{ 'border-accent': selected === null }"
      :aria-pressed="selected === null"
      @click="selected = null"
    >
      All
    </button>
    <button
      v-for="tag in tags"
      :key="tag"
      type="button"
      class="btn btn-sm btn-neutral"
      :class="{ 'border-accent': selected?.toLowerCase() === tag.toLowerCase() }"
      :aria-pressed="selected?.toLowerCase() === tag.toLowerCase()"
      @click="selected = tag"
    >
      {{ tag }}
    </button>
  </div>
</template>
