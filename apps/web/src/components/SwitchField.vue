<script setup lang="ts">
import { useTemplateRef } from 'vue'

/**
 * A switch for one state of one thing (Read, Keep, Show read), saved as soon as it is flipped. Use a checkbox only
 * to select items for a bulk action. The label is a fixed word that never flips ("Read", not "Unread"); inside a
 * list give `name` the item too, so each switch has its own name ("Read: A paper").
 *
 * It flips under the finger at once; `modelValue` is what is saved. If saving fails the parent calls `revert()` to
 * put the switch back to `modelValue`.
 */
const props = defineProps<{
  modelValue: boolean
  label: string
  /** The accessible name, when it needs more than the visible label. */
  name?: string
  disabled?: boolean
  /** A smaller switch for one that repeats on every row of a list. */
  compact?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [on: boolean] }>()
const input = useTemplateRef<HTMLInputElement>('input')
function flipped() {
  emit('update:modelValue', input.value!.checked)
}
defineExpose({
  revert() {
    if (input.value) input.value.checked = props.modelValue
  },
})
</script>

<template>
  <label class="switch" :class="{ 'switch-compact': compact }">
    <input
      ref="input"
      type="checkbox"
      role="switch"
      :checked="modelValue"
      :disabled="disabled"
      :aria-label="name"
      @change="flipped"
    />
    <span data-switch-track aria-hidden="true"></span>
    <span>{{ label }}</span>
  </label>
</template>
