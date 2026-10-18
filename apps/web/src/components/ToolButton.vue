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
    :aria-haspopup="popup"
    :aria-expanded="popup === 'true' ? expanded : undefined"
    :tabindex="tabindex"
    @click="$emit('press')"
  >
    <Icon :name="icon" />
  </button>
</template>
