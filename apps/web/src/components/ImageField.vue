<script setup lang="ts">
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '@lfwa/core'
import { ref, useId } from 'vue'

defineProps<{ label: string; hint?: string }>()
const emit = defineEmits<{ select: [file: File] }>()

const id = useId()
const input = ref<HTMLInputElement>()
const problem = ref('')

/** Catches the obvious mistakes immediately; the server makes the final decision. */
function onChange() {
  const file = input.value?.files?.[0]
  if (!file) return
  problem.value = ''
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    problem.value = 'Choose a PNG, JPEG, WebP or GIF image.'
  } else if (file.size > MAX_IMAGE_BYTES) {
    problem.value = `That image is too large. Choose one under ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`
  }
  if (problem.value) {
    input.value!.value = ''
    return
  }
  emit('select', file)
  input.value!.value = '' // so choosing the same file again still counts as a change
}
</script>

<template>
  <div class="mb-4">
    <label :for="id" class="mb-1 block text-sm font-medium">{{ label }}</label>
    <input
      :id="id"
      ref="input"
      type="file"
      :accept="IMAGE_TYPES.join(',')"
      :aria-describedby="`${id}-hint`"
      class="block w-full text-sm file:mr-3 file:rounded-ctl file:border file:border-line-strong file:bg-surface file:px-3 file:py-2 file:text-sm hover:file:bg-sunken"
      @change="onChange"
    />
    <p :id="`${id}-hint`" class="mt-1 text-sm text-ink-soft">
      {{ hint ?? 'PNG, JPEG, WebP or GIF, up to 1 MB.' }}
    </p>
    <p v-if="problem" role="alert" class="mt-1 text-sm text-danger">{{ problem }}</p>
  </div>
</template>
