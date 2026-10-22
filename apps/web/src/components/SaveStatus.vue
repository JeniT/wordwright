<script setup lang="ts">
import { computed, useSlots, type Ref } from 'vue'
import { errorMessage } from '../lib/api'
import Icon from './Icon.vue'

type Mutation = {
  isPending: Ref<boolean>
  isSuccess: Ref<boolean>
  isError: Ref<boolean>
  error: Ref<unknown>
}

/**
 * What a save is doing, said the same way on every form: nothing while idle, the `saving` words while it runs,
 * "Saved" (or the slot, for a message that says more) once it has, and the reason in an alert if it failed. Give it
 * every mutation the form can run. Put it beside the button, or above it for a longer message.
 */
const props = withDefaults(
  defineProps<{
    mutation: Mutation | Mutation[]
    /** Said once it has worked; empty for none (a form that only needs its errors shown). */
    saved?: string
    /** Said while it runs. */
    saving?: string
    /** A message of the form's own, shown when nothing is wrong (for example what a reset did). */
    text?: string
    /**
     * The form holds changes that aren't saved. "Saved" is only true while the form matches what was saved, so it
     * is hidden then and comes back if the person edits back to the saved value. A running save and an error stay.
     */
    unsaved?: boolean
  }>(),
  { saved: 'Saved', saving: '', text: '', unsaved: false },
)
const slots = useSlots()
const all = computed(() => (Array.isArray(props.mutation) ? props.mutation : [props.mutation]))
const failed = computed(() => all.value.find((m) => m.isError.value))
const state = computed<'saving' | 'text' | 'saved' | 'idle'>(() => {
  if (props.text) return 'text'
  if (all.value.some((m) => m.isPending.value)) return 'saving'
  if (!props.unsaved && all.value.some((m) => m.isSuccess.value)) return 'saved'
  return 'idle'
})
const message = computed(
  () => ({ saving: props.saving, text: props.text, saved: props.saved, idle: '' })[state.value],
)
</script>

<template>
  <p v-if="failed" role="alert" class="text-danger">{{ errorMessage(failed.error.value) }}</p>
  <p v-else-if="state === 'saved' && slots.default" role="status" class="text-sm text-ink-soft">
    <slot />
  </p>
  <p v-else-if="message" role="status" class="text-sm text-ink-soft">
    <!-- A tick beside "Saved", so it is not only words; the words say it to a screen reader. -->
    <Icon v-if="state === 'saved'" name="check" :size="14" class="mr-1 inline align-[-2px]" />{{
      message
    }}
  </p>
</template>
