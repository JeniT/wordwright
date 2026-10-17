<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import { useModal } from '../lib/modal'

/**
 * Where a link's address is entered, for both editors: a modal dialog, so the address gets the writer's whole
 * attention and the editor's selection is left alone behind it. Only web and email addresses are kept, and
 * `example.com` is taken to mean https://example.com. The caller gets the tidied address and does the linking.
 */
const props = defineProps<{
  open: boolean
  /** The address of the link the cursor is in, if it is in one. */
  address: string
}>()
const emit = defineEmits<{ apply: [href: string]; remove: []; cancel: [] }>()

const titleId = useId()
const inputId = useId()
const dialog = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const value = ref('')
const error = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    value.value = props.address
    error.value = ''
  },
  { immediate: true },
)

useModal({
  open: () => props.open,
  dialog,
  onEscape: () => emit('cancel'),
  initialFocus: () => input.value,
})

/** `example.com` is taken to mean https://example.com; only web and email addresses are kept. */
function tidyAddress(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  return /^(https?:|mailto:)/i.test(withScheme) && !/\s/.test(withScheme) ? withScheme : null
}

function submit() {
  const href = tidyAddress(value.value)
  if (!href) {
    error.value = 'Enter a web address, like https://example.com'
    return
  }
  emit('apply', href)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
      @click.self="emit('cancel')"
    >
      <div
        ref="dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        class="panel w-full max-w-md p-6"
      >
        <form @submit.prevent="submit">
          <h2 :id="titleId" class="mb-3 font-display text-xl font-semibold">
            {{ address ? 'Change link' : 'Add a link' }}
          </h2>
          <label :for="inputId" class="mb-1 block text-sm font-medium">Link address</label>
          <input
            :id="inputId"
            ref="input"
            v-model="value"
            class="field"
            autocomplete="off"
            autocapitalize="none"
            :spellcheck="false"
            :aria-invalid="!!error"
            :aria-describedby="error ? `${inputId}-error` : undefined"
            @input="error = ''"
          />
          <p v-if="error" :id="`${inputId}-error`" role="alert" class="mt-1 text-sm text-danger">
            {{ error }}
          </p>
          <div class="mt-5 flex flex-wrap justify-end gap-3">
            <button type="button" class="btn btn-neutral" @click="emit('cancel')">Cancel</button>
            <button v-if="address" type="button" class="btn btn-outline" @click="emit('remove')">
              Remove link
            </button>
            <button type="submit" class="btn btn-primary">
              {{ address ? 'Change link' : 'Add link' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
