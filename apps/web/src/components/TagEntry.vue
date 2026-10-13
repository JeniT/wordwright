<script setup lang="ts">
import { ref, useId, useTemplateRef } from 'vue'
import { parseTags } from '../lib/note-tags'

/**
 * A field for entering tags one at a time: type a tag and press Enter, and it is handed over (`add`) and the field is
 * emptied but kept, with focus, ready for the next. A comma also separates tags, so a pasted list still works. Used
 * for tagging one note or link, and for tagging several at once, so the two behave alike. Tags already used on the
 * list are offered by the browser as the person types.
 */
defineProps<{
  /** The field's name for screen readers. It has no visible label (the controls around it say what it is for). */
  label: string
  suggestions?: readonly string[]
  disabled?: boolean
  placeholder?: string
}>()
const emit = defineEmits<{ add: [tag: string]; escape: [] }>()
const text = ref('')
const input = useTemplateRef<HTMLInputElement>('input')
const listId = useId()

function submit() {
  const tags = parseTags(text.value)
  text.value = ''
  for (const tag of tags) emit('add', tag)
}
defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <span class="inline-flex min-w-0 items-center">
    <input
      ref="input"
      v-model="text"
      type="text"
      class="field !min-h-8 !w-44 !py-0.5 text-sm"
      :aria-label="label"
      :placeholder="placeholder ?? 'Type a tag…'"
      :disabled="disabled"
      :list="suggestions?.length ? listId : undefined"
      autocomplete="off"
      :maxlength="40"
      @keydown.enter.prevent="submit"
      @keydown.esc="emit('escape')"
    />
    <datalist v-if="suggestions?.length" :id="listId">
      <option v-for="tag in suggestions" :key="tag" :value="tag" />
    </datalist>
  </span>
</template>
