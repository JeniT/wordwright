<script setup lang="ts">
import { dragLabel, removeDragLabel } from '../lib/drag-label'
import { vTip } from '../lib/tip'
import Icon from './Icon.vue'

/**
 * One note or reading item in the drafting side bar. The same card for both, so they look and behave alike: a left
 * rail you drag onto the draft (wide screens only; a phone cannot drag, and the draft is behind the drawer), then the
 * icon button that adds it to the draft, then whatever the item shows. The rail is the shared `list-rail`, but drag
 * only: this is a source to take from, not a list to put in order. Someone who may not change the draft sees neither
 * the rail nor the button.
 */
const props = defineProps<{
  /** The person may put things in the draft. */
  canAdd: boolean
  /** The drag type and what travels under it (the item's id). */
  drag: { type: string; id: string }
  /** What to call the item when dragging it and in the button's name: “note “Erosion loops.””. */
  label: string
  /** Its button's accessible name, “Add note “…” to the draft”. */
  addName: string
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
      class="list-rail list-rail-grab hidden select-none lg:flex"
      draggable="true"
      data-testid="rail"
      title="Drag into the draft"
      @dragstart="onDragStart"
      @dragend="removeDragLabel"
    >
      <svg
        class="list-rail-grip my-auto"
        width="10"
        height="16"
        viewBox="0 0 10 16"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <circle v-for="y in [2, 8, 14]" :key="`l${y}`" cx="2" :cy="y" r="1.5" />
        <circle v-for="y in [2, 8, 14]" :key="`r${y}`" cx="8" :cy="y" r="1.5" />
      </svg>
    </div>
    <div class="flex min-w-0 flex-1 gap-2 p-3">
      <button
        v-if="canAdd"
        v-tip="'Add to draft'"
        type="button"
        class="btn btn-sm btn-icon btn-ghost shrink-0"
        :disabled="busy"
        :aria-label="addName"
        @click="emit('add')"
      >
        <Icon :name="busy ? 'working' : 'insert'" :class="{ 'motion-safe:animate-spin': busy }" />
      </button>
      <div class="min-w-0 flex-1"><slot /></div>
    </div>
  </li>
</template>
