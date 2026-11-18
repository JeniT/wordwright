<script setup lang="ts">
import { computed, useId } from 'vue'
import Icon from './Icon.vue'

/**
 * A labelled text box. `hint` is quiet help under it; `error` is why what was typed couldn't be used or saved, said
 * as an alert in the danger colour, with the box marked invalid. Give one or the other, not both at once.
 */
const props = defineProps<{
  label: string
  hint?: string
  error?: string
  rows?: number
  maxlength?: number
}>()
const model = defineModel<string>({ required: true })
const id = useId()
const describedBy = computed(
  () =>
    [props.hint && `${id}-hint`, props.error && `${id}-error`].filter(Boolean).join(' ') ||
    undefined,
)
</script>

<template>
  <div class="mb-4">
    <label :for="id" class="mb-1 block text-sm font-medium">{{ label }}</label>
    <textarea
      :id="id"
      v-model="model"
      :rows="rows ?? 6"
      :maxlength="maxlength"
      :aria-describedby="describedBy"
      :aria-invalid="error ? true : undefined"
      class="field"
    />
    <p v-if="hint" :id="`${id}-hint`" class="mt-1 text-sm text-ink-soft">{{ hint }}</p>
    <p
      v-if="error"
      :id="`${id}-error`"
      role="alert"
      class="mt-1 flex items-start gap-1.5 text-sm text-danger"
    >
      <Icon name="alert" class="mt-0.5 shrink-0" />
      <span>{{ error }}</span>
    </p>
  </div>
</template>
