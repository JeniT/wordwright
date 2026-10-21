<script setup lang="ts">
/** The tick for a quotation, with what it does; used with `useQuoteTick` (lib/quote-tick.ts). */
defineProps<{ tickedByPaste: boolean }>()
const isQuote = defineModel<boolean>({ required: true })
defineEmits<{ ticked: [] }>()
</script>

<template>
  <div class="mb-3">
    <label class="mb-1 flex items-start gap-2 text-sm">
      <input
        v-model="isQuote"
        type="checkbox"
        class="mt-0.5 size-4 accent-accent"
        @change="$emit('ticked')"
      />
      <span>This is a quotation</span>
    </label>
    <p aria-live="polite" class="ml-6 text-sm text-ink-soft" data-paste-note>
      <template v-if="tickedByPaste && isQuote">
        Ticked because you pasted it. Untick it if these are your words.
      </template>
    </p>
    <p class="ml-6 text-sm text-ink-soft">
      You can’t edit notes that are marked as quotations. They can be inserted directly as
      quotations into your drafts.
    </p>
  </div>
</template>
