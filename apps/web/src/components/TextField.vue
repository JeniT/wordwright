<script setup lang="ts">
import { useId } from 'vue'

defineProps<{
  label: string
  type?: string
  autocomplete?: string
  hint?: string
  required?: boolean
  /** Marks the hint as an error message for the field. */
  invalid?: boolean
  autocapitalize?: string
  spellcheck?: boolean
  maxlength?: number
}>()
const model = defineModel<string>({ required: true })
const id = useId()
</script>

<template>
  <div class="mb-4">
    <label :for="id" class="mb-1 block text-sm font-medium">{{ label }}</label>
    <input
      :id="id"
      v-model="model"
      :type="type ?? 'text'"
      :autocomplete="autocomplete"
      :required="required"
      :autocapitalize="autocapitalize"
      :spellcheck="spellcheck"
      :maxlength="maxlength"
      :aria-invalid="invalid || undefined"
      :aria-describedby="hint ? `${id}-hint` : undefined"
      class="field"
    />
    <!-- Live, so a changing hint (e.g. "That username is taken") is read out as the person types. -->
    <p
      v-if="hint"
      :id="`${id}-hint`"
      aria-live="polite"
      class="mt-1 text-sm"
      :class="invalid ? 'text-danger' : 'text-ink-soft'"
    >
      {{ hint }}
    </p>
  </div>
</template>
