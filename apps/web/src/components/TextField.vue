<script setup lang="ts">
import { computed, useId, useSlots } from 'vue'
import Explain from './Explain.vue'
import Icon from './Icon.vue'

/**
 * A labelled one-line field, the twin of `TextAreaField`. `hint` is quiet help under it; `error` is why what was typed
 * couldn't be used or saved, said as an alert in the danger colour with the alert icon, the field marked invalid, and
 * the hint left where it is (#458).
 *
 * `invalid` is for something else: a hint that checks what is being typed as it changes (a username that is taken).
 * That hint turns to the danger colour with the alert icon but stays a polite live region, not an alert, since an alert
 * on every keystroke would keep interrupting a screen reader.
 */
const props = defineProps<{
  label: string
  /** The explanation's icon name ("About the name"); needed with the `explain` slot. */
  explainLabel?: string
  type?: string
  autocomplete?: string
  hint?: string
  /** Why what was typed couldn't be used or saved: an alert under the hint. */
  error?: string
  /** The label stays for screen readers but isn't drawn: for a field that sits under a heading saying the same thing. */
  hideLabel?: boolean
  /** Greyed text that goes once something is typed. It shows an example or the current value, never the label. */
  placeholder?: string
  required?: boolean
  /** The live hint is saying what is wrong with what is being typed (see above). */
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
const slots = useSlots()
const hasHint = computed(() => !!props.hint || !!slots.hint)
const describedBy = computed(
  () =>
    [hasHint.value && `${id}-hint`, props.error && `${id}-error`].filter(Boolean).join(' ') ||
    undefined,
)
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
      :aria-invalid="invalid || error ? true : undefined"
      :aria-describedby="describedBy"
      class="field"
    />
    <!-- Live, so a changing hint (e.g. "That username is taken") is read out as the person types. -->
    <p
      v-if="hasHint"
      :id="`${id}-hint`"
      aria-live="polite"
      class="mt-1 text-sm"
      :class="invalid ? 'flex items-start gap-1.5 text-danger' : 'text-ink-soft'"
    >
      <Icon v-if="invalid" name="alert" class="mt-0.5 shrink-0" />
      <span
        ><slot name="hint">{{ hint }}</slot></span
      >
    </p>
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
