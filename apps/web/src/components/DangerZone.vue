<script setup lang="ts">
import { useId } from 'vue'

/**
 * The box at the bottom of a page for deleting a whole thing (account, publication, idea) and what belongs to it.
 * The slot holds the explanation and the button that opens a `ConfirmDialog`; `error` shows why a delete failed.
 */
defineProps<{
  title: string
  error?: string
  /** The page's own title already says it: name the region without repeating it as a heading. */
  hideTitle?: boolean
}>()
const headingId = useId()
</script>

<template>
  <section
    :aria-labelledby="hideTitle ? undefined : headingId"
    :aria-label="hideTitle ? title : undefined"
    class="callout callout-danger"
  >
    <h2
      v-if="!hideTitle"
      :id="headingId"
      class="mb-2 font-display text-xl font-semibold text-danger"
    >
      {{ title }}
    </h2>
    <slot />
    <p v-if="error" role="alert" class="mb-3 text-danger">{{ error }}</p>
    <slot name="action" />
  </section>
</template>
