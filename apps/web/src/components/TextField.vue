<script setup lang="ts">
import { useId } from 'vue'
import Explain from './Explain.vue'

defineProps<{
  label: string
  /** The explanation's icon name ("About the name"); needed with the `explain` slot. */
  explainLabel?: string
  type?: string
  autocomplete?: string
  hint?: string
  /** The label stays for screen readers but isn't drawn: for a field that sits under a heading saying the same thing. */
  hideLabel?: boolean
  /** Greyed text that goes once something is typed. It shows an example or the current value, never the label. */
  placeholder?: string
  required?: boolean
  /** Marks the hint as an error message for the field. */
  invalid?: boolean
  autocapitalize?: string
  spellcheck?: boolean
  maxlength?: number
}>()
defineSlots<{
  /** A hint with a link in it; for plain words use the `hint` prop. */
  hint?(): unknown
  /** An explanation of the field, as an info icon at the right of the label row (see `Explain`). */
  explain?(): unknown
}>()
const model = defineModel<string>({ required: true })
const id = useId()
</script>

<template>
  <div class="mb-4">
    <div
      class="mb-1 flex flex-wrap items-center justify-between gap-x-2"
      :class="hideLabel && !$slots.explain ? 'sr-only' : ''"
    >
      <label :for="id" class="block text-sm font-medium" :class="hideLabel ? 'sr-only' : ''">{{
        label
      }}</label>
      <Explain v-if="$slots.explain" :label="explainLabel ?? 'More information'"
        ><slot name="explain"
      /></Explain>
    </div>
    <input
      :id="id"
      v-model="model"
      :type="type ?? 'text'"
      :autocomplete="autocomplete"
      :placeholder="placeholder"
      :required="required"
      :autocapitalize="autocapitalize"
      :spellcheck="spellcheck"
      :maxlength="maxlength"
      :aria-invalid="invalid || undefined"
      :aria-describedby="hint || $slots.hint ? `${id}-hint` : undefined"
      class="field"
    />
    <!-- Live, so a changing hint (e.g. "That username is taken") is read out as the person types. -->
    <p
      v-if="hint || $slots.hint"
      :id="`${id}-hint`"
      aria-live="polite"
      class="mt-1 text-sm"
      :class="invalid ? 'text-danger' : 'text-ink-soft'"
    >
      <slot name="hint">{{ hint }}</slot>
    </p>
  </div>
</template>
