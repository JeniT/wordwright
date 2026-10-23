<script setup lang="ts">
import { dragLabel, removeDragLabel } from '../lib/drag-label'
import { vTip } from '../lib/tip'
import Icon from './Icon.vue'

/**
 * One note or reading item in the drafting side bar. The same card for both, so they look and behave alike: a left
 * rail whose top is the icon button that inserts it at the cursor and whose grip you drag onto the draft (the grip is
 * wide screens only; a phone cannot drag, and the draft is behind the drawer), then whatever the item shows. The rail
 * is the shared `list-rail`, but drag only: this is a source to take from, not a list to put in order. Someone who may not change the draft sees neither
 * the rail nor the button.
 */
const props = defineProps<{
  /** The person may put things in the draft. */
  canAdd: boolean
  /** The drag type and what travels under it (the item's id). */
  drag: { type: string; id: string }
  /** What to call the item when dragging it and in the button's name: “note “Erosion loops.””. */
  label: string
  busy?: boolean
}>()
const emit = defineEmits<{ add: [] }>()

/** Only the item's id travels; the draft finds the rest. */
function onDragStart(event: DragEvent) {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData(props.drag.type, props.drag.id)
  event.dataTransfer.setDragImage(dragLabel(props.label), 12, 12)
}
</script>

<template>
  <li class="flex overflow-hidden rounded-ctl border border-line bg-surface">
    <div
      v-if="canAdd"
      class="list-rail list-rail-grab relative select-none lg:min-h-20"
      draggable="true"
      data-testid="rail"
      @dragstart="onDragStart"
      @dragend="removeDragLabel"
    >
      <button
        v-tip="'Insert at cursor'"
        type="button"
        class="btn btn-sm btn-icon btn-ghost shrink-0"
        :disabled="busy"
        :aria-label="`Insert at cursor: ${label}`"
        @click="emit('add')"
      >
        <Icon :name="busy ? 'working' : 'insert'" :class="{ 'motion-safe:animate-spin': busy }" />
      </button>
      <svg
        class="list-rail-grip absolute top-[max(50%,3.75rem)] left-1/2 hidden -translate-x-1/2 -translate-y-1/2 lg:block"
        width="10"
        height="16"
        viewBox="0 0 10 16"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
        title="Drag into the draft"
      >
        <circle v-for="y in [2, 8, 14]" :key="`l${y}`" cx="2" :cy="y" r="1.5" />
        <circle v-for="y in [2, 8, 14]" :key="`r${y}`" cx="8" :cy="y" r="1.5" />
      </svg>
    </div>
    <div class="min-w-0 flex-1 p-3"><slot /></div>
  </li>
</template>
