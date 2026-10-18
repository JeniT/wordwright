<script setup lang="ts">
/**
 * A one-field form with its button on the same row: adding a web address to a reading list, naming a new idea. The
 * field (a `TextField`) goes in the slot; the button submits the form around this. One component so every such form
 * lines up the same way: the button sits level with the field, below the label's height.
 */
defineProps<{
  /** The button's words ("Add item"). */
  action: string
  /** The button's words while it works ("Adding…"). */
  busyText: string
  busy?: boolean
  /** The main action of its screen (Quick add's buttons are); the default is the quieter outline. */
  primary?: boolean
}>()
</script>

<template>
  <div class="flex items-start gap-2">
    <div class="min-w-0 flex-1 [&>div]:!mb-0"><slot /></div>
    <!-- Level with the field: the label above it is 1.5rem tall. -->
    <button
      type="submit"
      class="btn mt-6"
      :class="primary ? 'btn-primary' : 'btn-outline'"
      :disabled="busy"
    >
      {{ busy ? busyText : action }}
    </button>
  </div>
</template>
