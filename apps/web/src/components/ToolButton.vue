<script setup lang="ts">
import { vTip } from '../lib/tip'
import Icon from './Icon.vue'

/** One icon-only button of an editor toolbar: named by its label, with a tooltip (`v-tip`), and pressed when it is on. */
defineProps<{
  label: string
  title: string
  icon: InstanceType<typeof Icon>['$props']['name']
  pressed: boolean
  /** An action rather than a state, so it has no pressed state to announce. */
  momentary?: boolean
  disabled?: boolean
  /**
   * Can't be used right now, but stays in the tab order so the reason can be reached: pressing it still emits `press`
   * (the page says why it did nothing), as with `SwitchField`'s `unavailable`.
   */
  unavailable?: boolean
  /** The toolbar's one tab stop is 0; the others are reached with the arrow keys. */
  tabindex?: number
  /** Set on the buttons that open something (the link dialog, the More menu). */
  popup?: 'dialog' | 'true'
  expanded?: boolean
}>()
defineEmits<{ press: [] }>()
</script>

<template>
  <button
    type="button"
    class="btn btn-sm btn-icon btn-ghost"
    :aria-label="label"
    v-tip="title"
    :aria-pressed="popup === 'true' || momentary ? undefined : pressed"
    :disabled="disabled"
    :aria-disabled="unavailable ? true : undefined"
    :aria-haspopup="popup"
    :aria-expanded="popup === 'true' ? expanded : undefined"
    :tabindex="tabindex"
    @click="$emit('press')"
  >
    <Icon :name="icon" />
  </button>
</template>
