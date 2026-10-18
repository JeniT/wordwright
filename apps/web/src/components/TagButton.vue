<script setup lang="ts">
import { useTemplateRef } from 'vue'
import Icon from './Icon.vue'
import { vTip } from '../lib/tip'

/**
 * The icon that opens (and closes) the tag field of one note or link. It sits with the item's other icon buttons;
 * the tags themselves and the field are `TagEditor`, under the item.
 */
defineProps<{ label: string; open: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
const button = useTemplateRef<HTMLButtonElement>('button')
defineExpose({ focus: () => button.value?.focus() })
</script>

<template>
  <button
    ref="button"
    v-tip="open ? 'Done tagging' : 'Tag'"
    type="button"
    class="btn btn-sm btn-icon btn-ghost"
    :aria-label="open ? `Done tagging ${label}` : `Add tags to ${label}`"
    :aria-expanded="open"
    @click="emit('toggle')"
  >
    <Icon :name="open ? 'check' : 'label'" />
  </button>
</template>
