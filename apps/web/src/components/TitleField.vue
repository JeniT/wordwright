<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'

/**
 * A draft's title: a field that grows to show every wrapped line, and never holds a line break (Return asks the
 * page to move on to the body instead).
 */
const props = defineProps<{ id: string; readonly?: boolean; placeholder?: string }>()
const model = defineModel<string>({ default: '' })
const emit = defineEmits<{ enter: [] }>()
let observer: ResizeObserver | undefined
const field = useTemplateRef<HTMLTextAreaElement>('field')

function grow() {
  const el = field.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
function onInput(event: Event) {
  const el = event.target as HTMLTextAreaElement
  // A pasted line break becomes a space, so the title stays one paragraph.
  model.value = el.value.replace(/\s*\r?\n\s*/g, ' ')
  if (el.value !== model.value) el.value = model.value
}
function onEnter(event: KeyboardEvent) {
  if (event.isComposing) return
  event.preventDefault()
  if (props.readonly) return
  emit('enter')
}
watch(model, () => nextTick(grow))
onMounted(() => {
  grow()
  // A narrower window wraps more lines, and a field mounted in a hidden tab measures 0 until it is shown.
  if (typeof ResizeObserver !== 'undefined' && field.value) {
    observer = new ResizeObserver(grow)
    observer.observe(field.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <textarea
    :id="props.id"
    ref="field"
    :value="model"
    :readonly="props.readonly"
    rows="1"
    class="block w-full min-w-0 resize-none overflow-hidden bg-transparent font-display text-3xl font-semibold outline-none placeholder:text-ink-soft"
    :placeholder="props.placeholder"
    @input="onInput"
    @keydown.enter="onEnter"
  ></textarea>
</template>
