<script setup lang="ts">
import { ref, useId } from 'vue'
import { useModal } from '../lib/modal'

const props = defineProps<{
  open: boolean
  title: string
  confirmLabel: string
  // Disables both buttons while the confirmed action is running.
  busy?: boolean
  /** Shown on the confirm button while busy. */
  busyLabel?: string
  /** A second way forward, between Cancel and the confirm button ("Read it now"). */
  alternateLabel?: string
  /** `danger` (red, the default) is for deleting; `primary` for a choice that loses nothing. */
  confirmTone?: 'danger' | 'primary'
}>()
const emit = defineEmits<{ confirm: []; cancel: []; alternate: [] }>()

const titleId = useId()
const dialog = ref<HTMLElement | null>(null)
const cancelButton = ref<HTMLButtonElement | null>(null)

useModal({
  open: () => props.open,
  dialog,
  onEscape: () => emit('cancel'),
  canEscape: () => !props.busy,
  // Focus the safe choice, so a stray Enter doesn't confirm.
  initialFocus: () => cancelButton.value,
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
      @click.self="!busy && emit('cancel')"
    >
      <div
        ref="dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        class="panel w-full max-w-md p-6"
      >
        <h2 :id="titleId" class="mb-2 font-display text-xl font-semibold">{{ title }}</h2>
        <div class="mb-5 text-sm text-ink-soft"><slot /></div>
        <div class="flex flex-wrap justify-end gap-3">
          <button
            ref="cancelButton"
            type="button"
            class="btn btn-neutral"
            :disabled="busy"
            @click="emit('cancel')"
          >
            Cancel
          </button>
          <button
            v-if="alternateLabel"
            type="button"
            class="btn btn-outline"
            :disabled="busy"
            @click="emit('alternate')"
          >
            {{ alternateLabel }}
          </button>
          <button
            type="button"
            class="btn"
            :class="confirmTone === 'primary' ? 'btn-primary' : 'btn-danger-solid'"
            :disabled="busy"
            @click="emit('confirm')"
          >
            {{ busy ? (busyLabel ?? 'Working…') : confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
