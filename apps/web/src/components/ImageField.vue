<script setup lang="ts">
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '@wordwright/core'
import { ref, useId } from 'vue'
import { downscalePicture, UnreadablePicture } from '../lib/downscale-image'

defineProps<{ label: string; hint?: string }>()
const emit = defineEmits<{ select: [file: File] }>()

const id = useId()
const input = ref<HTMLInputElement>()
const problem = ref('')
const working = ref(false)
/** Counts picks, so a slow earlier one cannot land after a later one. */
let latest = 0

/**
 * Catches the obvious mistakes immediately (the server makes the final decision), and shrinks a large picture first so
 * a phone photo needs no resizing by the writer.
 */
async function onChange() {
  const chosen = input.value?.files?.[0]
  if (!chosen) return
  const mine = ++latest
  problem.value = ''
  input.value!.value = '' // so choosing the same file again still counts as a change
  if (!(IMAGE_TYPES as readonly string[]).includes(chosen.type)) {
    working.value = false
    problem.value = 'Choose a PNG, JPEG, WebP or GIF image.'
    return
  }
  working.value = true
  let file: File | undefined
  try {
    file = await downscalePicture(chosen)
  } catch (error) {
    if (!(error instanceof UnreadablePicture)) throw error
  } finally {
    if (mine === latest) working.value = false
  }
  if (mine !== latest) return
  if (!file) {
    problem.value = 'That file could not be read as a picture. Choose a different one.'
  } else if (file.size > MAX_IMAGE_BYTES) {
    problem.value = `That image is too large. Choose one under ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`
  } else {
    emit('select', file)
  }
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
      {{
        hint ??
        'PNG, JPEG, WebP or GIF. A large picture is made smaller for you; a GIF must be under 1 MB.'
      }}
    </p>
    <p v-if="working" role="status" class="mt-1 text-sm text-ink-soft">
      Making the picture smaller…
    </p>
    <p v-if="problem" role="alert" class="mt-1 text-sm text-danger">{{ problem }}</p>
  </div>
</template>
