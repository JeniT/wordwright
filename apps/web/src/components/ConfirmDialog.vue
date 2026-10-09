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
}>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()

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
      class="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4"
      @click.self="!busy && emit('cancel')"
    >
      <div
        ref="dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        class="w-full max-w-md rounded bg-white p-6 shadow-lg"
      >
        <h2 :id="titleId" class="mb-2 font-serif text-xl font-semibold">{{ title }}</h2>
        <div class="mb-5 text-sm text-stone-700"><slot /></div>
        <div class="flex flex-wrap justify-end gap-3">
          <button
            ref="cancelButton"
            type="button"
            class="rounded border border-stone-300 bg-white px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
            :disabled="busy"
            @click="emit('cancel')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
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
