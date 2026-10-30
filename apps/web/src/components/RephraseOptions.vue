<script setup lang="ts">
import { ref, watch } from 'vue'
import type { RephraseSize } from '@wordwright/core'

/**
 * The options from one round. Short wording gets a list, where the options can be read side by side; longer wording
 * gets a carousel, one option at a time, because each is a paragraph. Either way each option has its own button that
 * puts it in the wording field to be edited: nothing here is used until the writer presses "Use this" in the dialog.
 */
const props = defineProps<{ size: RephraseSize; options: string[] }>()
const emit = defineEmits<{ pick: [option: string] }>()

const index = ref(0)
watch(
  () => props.options,
  () => (index.value = 0),
)
const last = () => props.options.length - 1
function step(by: number) {
  index.value = Math.min(last(), Math.max(0, index.value + by))
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight') step(1)
  else if (event.key === 'ArrowLeft') step(-1)
  else return
  event.preventDefault()
}
</script>

<template>
  <ol v-if="size === 'short'" class="space-y-2" aria-label="Options">
    <li
      v-for="(option, i) in options"
      :key="option"
      class="flex items-start justify-between gap-3 rounded-ctl border border-line bg-surface p-3"
    >
      <p class="min-w-0 break-words">{{ option }}</p>
      <button
        type="button"
        class="btn btn-sm btn-outline shrink-0"
        :aria-label="`Replace wording with option ${i + 1}: ${option}`"
        @click="emit('pick', option)"
      >
        Replace wording
      </button>
    </li>
  </ol>

  <div
    v-else
    role="group"
    aria-roledescription="carousel"
    aria-label="Options"
    class="rounded-ctl border border-line bg-surface p-3"
    @keydown="onKeydown"
  >
    <div
      role="group"
      aria-roledescription="slide"
      :aria-label="`Option ${index + 1} of ${options.length}`"
    >
      <p class="mb-3 break-words whitespace-pre-line">{{ options[index] }}</p>
      <button
        type="button"
        class="btn btn-sm btn-outline"
        :aria-label="`Replace wording with option ${index + 1}`"
        @click="emit('pick', options[index]!)"
      >
        Replace wording
      </button>
    </div>
    <div class="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
      <button
        type="button"
        class="btn btn-sm btn-neutral"
        :disabled="index === 0"
        @click="step(-1)"
      >
        Previous
      </button>
      <p class="text-sm text-ink-soft" aria-live="polite">
        Option {{ index + 1 }} of {{ options.length }}
      </p>
      <button
        type="button"
        class="btn btn-sm btn-neutral"
        :disabled="index === last()"
        @click="step(1)"
      >
        Next
      </button>
    </div>
  </div>
</template>
