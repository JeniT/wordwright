<script setup lang="ts">
import { ref, useId } from 'vue'
import { useModal } from '../lib/modal'

/**
 * A dialog that holds a form or some information, closed with Escape, a click outside, or its own button. A choice
 * that must be confirmed uses `ConfirmDialog`; this is for everything else, so they all behave alike.
 */
const props = withDefaults(
  defineProps<{ open: boolean; title: string; closeLabel?: string; footer?: boolean }>(),
  { closeLabel: 'Close', footer: true },
)
const emit = defineEmits<{ close: [] }>()

const titleId = useId()
const dialog = ref<HTMLElement | null>(null)

useModal({
  open: () => props.open,
  dialog,
  onEscape: () => emit('close'),
  // A field if there is one, else the first button, so typing can start at once.
  initialFocus: () =>
    dialog.value?.querySelector<HTMLElement>('input, select, textarea') ??
    dialog.value?.querySelector<HTMLElement>('button'),
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
      @click.self="emit('close')"
    >
      <div
        ref="dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        class="panel max-h-[90vh] w-full max-w-lg overflow-y-auto p-6 text-sm"
      >
        <h2 :id="titleId" class="mb-3 font-display text-xl font-semibold">{{ title }}</h2>
        <slot />
        <div v-if="footer" class="mt-5 flex justify-end">
          <button type="button" class="btn btn-neutral" @click="emit('close')">
            {{ closeLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
