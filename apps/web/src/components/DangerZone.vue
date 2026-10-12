<script setup lang="ts">
import { useId } from 'vue'

/**
 * The box at the bottom of a page for deleting a whole thing (account, profile, idea) and what belongs to it.
 * The slot holds the explanation and the button that opens a `ConfirmDialog`; `error` shows why a delete failed.
 */
defineProps<{ title: string; error?: string }>()
const headingId = useId()
</script>

<template>
  <section :aria-labelledby="headingId" class="callout callout-danger">
    <h2 :id="headingId" class="mb-2 font-display text-xl font-semibold text-danger">{{ title }}</h2>
    <slot />
    <p v-if="error" role="alert" class="mb-3 text-danger">{{ error }}</p>
    <slot name="action" />
  </section>
</template>
