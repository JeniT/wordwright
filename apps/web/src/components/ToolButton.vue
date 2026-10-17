<script setup lang="ts">
import Icon from './Icon.vue'

/** One icon-only button of an editor toolbar: named by its label, with a tooltip, and pressed when it is on. */
defineProps<{
  label: string
  title: string
  icon: InstanceType<typeof Icon>['$props']['name']
  pressed: boolean
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
    :title="title"
    :aria-pressed="popup === 'true' ? undefined : pressed"
    :aria-haspopup="popup"
    :aria-expanded="popup === 'true' ? expanded : undefined"
    :tabindex="tabindex"
    @click="$emit('press')"
  >
    <Icon :name="icon" />
  </button>
</template>
