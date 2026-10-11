<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

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
let opener: Element | null = null

function focusables(): HTMLElement[] {
  return Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])
}

// A hand-rolled modal rather than <dialog>.showModal(), which jsdom (our component tests) lacks.
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !props.busy) {
    event.stopPropagation()
    emit('cancel')
  } else if (event.key === 'Tab') {
    const items = focusables()
    const first = items[0]
    const last = items[items.length - 1]
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      opener = document.activeElement
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      // Focus the safe choice, so a stray Enter doesn't confirm.
      cancelButton.value?.focus()
    } else {
      document.removeEventListener('keydown', onKeydown)
      if (opener instanceof HTMLElement) opener.focus()
      opener = null
    }
  },
)
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
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
            {{ busy ? (busyLabel ?? 'Deleting…') : confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
