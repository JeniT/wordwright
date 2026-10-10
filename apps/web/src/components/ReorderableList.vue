<script setup lang="ts" generic="T extends { id: string }">
import { nextTick, ref } from 'vue'

/**
 * An ordered list that people can rearrange: drag a row by its grip (the mouse route), or use the
 * arrow buttons (the keyboard and touch route; native drag and drop doesn't work on most touch
 * screens). It only decides the new order; `save` stores it, and the list shows whatever `items`
 * holds afterwards. Use it wherever order matters, so those lists look and behave alike.
 */
const props = defineProps<{
  items: readonly T[]
  /** What to call a row: names its buttons ("Move … up") and the announcement after a move. */
  itemLabel: (item: T) => string
  /** Stores the complete new order (every id). Resolves true if it was saved. */
  save: (ids: string[], moved: T) => Promise<boolean>
  /** Switches the arrows off, e.g. while a save is in flight. */
  disabled?: boolean
  /** `cards` lays the rows out as separate cards, two across where there is room. Defaults to a plain list. */
  layout?: 'list' | 'cards'
}>()

defineSlots<{
  /** The row's content; give it `min-w-0 flex-1` so it takes the space between grip and buttons. */
  default(props: { item: T; index: number }): unknown
  /** Extra buttons after the arrows, e.g. Remove. */
  actions?(props: { item: T; index: number }): unknown
}>()

const notice = ref('') // announced politely to screen readers after each move

const currentIds = () => props.items.map((item) => item.id)

/** Saves a new order and announces it; true if it was saved. */
async function saveOrder(ids: string[], moved: T) {
  if (!(await props.save(ids, moved))) return false
  notice.value = `Moved ${props.itemLabel(moved)} to position ${ids.indexOf(moved.id) + 1} of ${ids.length}`
  return true
}

// ---- buttons
async function moveBy(item: T, offset: -1 | 1) {
  const ids = currentIds()
  const from = ids.indexOf(item.id)
  const to = from + offset
  if (from < 0 || to < 0 || to >= ids.length) return
  ids.splice(to, 0, ...ids.splice(from, 1))
  if (!(await saveOrder(ids, item))) return
  // The rows are re-rendered in their new places; keep keyboard focus on the same row. At the
  // end of the list the button just used is disabled, so focus the opposite one instead.
  await nextTick()
  const button = (dir: 'up' | 'down') =>
    document.querySelector<HTMLButtonElement>(`[data-move="${item.id}-${dir}"]`)
  const wanted = button(offset === -1 ? 'up' : 'down')
  ;(wanted && !wanted.disabled ? wanted : button(offset === -1 ? 'down' : 'up'))?.focus()
}

// ---- dragging
const draggingId = ref<string | null>(null)
/** The row the pointer is over while dragging, and which half of it. */
const over = ref<{ id: string; after: boolean } | null>(null)

function onDragStart(event: DragEvent, item: T) {
  draggingId.value = item.id
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', props.itemLabel(item)) // Firefox only starts a drag if there is data
  // Only the grip is draggable, but the whole row is what moves, so show the whole row.
  const row = (event.currentTarget as HTMLElement).closest('li')
  if (row) event.dataTransfer.setDragImage(row, 16, 16)
}

function onDragOver(event: DragEvent, item: T) {
  if (!draggingId.value) return // something else (a file, some text) is being dragged
  event.preventDefault() // allows dropping here
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const row = event.currentTarget as HTMLElement
  const rect = row.getBoundingClientRect()
  // Cards sit side by side when there is room, so "before or after" is then left or right of the middle.
  const sideBySide =
    props.layout === 'cards' && (row.parentElement?.clientWidth ?? 0) > rect.width * 1.5
  over.value = {
    id: item.id,
    after: sideBySide
      ? event.clientX > rect.left + rect.width / 2
      : event.clientY > rect.top + rect.height / 2,
  }
}

async function onDrop(event: DragEvent) {
  event.preventDefault()
  const dragged = props.items.find((item) => item.id === draggingId.value)
  const target = over.value
  endDrag()
  if (!dragged || !target || target.id === dragged.id) return
  const ids = currentIds().filter((id) => id !== dragged.id)
  const at = ids.indexOf(target.id) + (target.after ? 1 : 0)
  ids.splice(at, 0, dragged.id)
  if (ids.join() === currentIds().join()) return
  await saveOrder(ids, dragged)
}

function endDrag() {
  draggingId.value = null
  over.value = null
}

const buttonClass =
  'rounded border border-stone-300 bg-white px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'
</script>

<template>
  <div>
    <ol
      :class="
        layout === 'cards'
          ? 'grid gap-3 sm:grid-cols-2'
          : 'divide-y divide-stone-200 rounded border border-stone-200 bg-white'
      "
    >
      <li
        v-for="(item, index) in items"
        :key="item.id"
        class="flex flex-wrap gap-x-3 gap-y-2 px-3 py-2"
        :class="[
          layout === 'cards'
            ? 'content-start items-start rounded border border-stone-200 border-x-2 bg-white'
            : 'items-center border-y-2 border-transparent',
          {
            'opacity-50': draggingId === item.id,
            'border-t-accent':
              layout !== 'cards' && over?.id === item.id && !over.after && draggingId !== item.id,
            'border-b-accent':
              layout !== 'cards' && over?.id === item.id && over.after && draggingId !== item.id,
            'border-l-accent':
              layout === 'cards' && over?.id === item.id && !over.after && draggingId !== item.id,
            'border-r-accent':
              layout === 'cards' && over?.id === item.id && over.after && draggingId !== item.id,
          },
        ]"
        @dragover="onDragOver($event, item)"
        @drop="onDrop"
      >
        <span
          class="cursor-grab select-none text-stone-500"
          draggable="true"
          title="Drag to change the order"
          aria-hidden="true"
          data-testid="grip"
          @dragstart="onDragStart($event, item)"
          @dragend="endDrag"
        >
          ⠿
        </span>
        <slot :item="item" :index="index" />
        <span class="flex shrink-0 gap-1">
          <button
            type="button"
            :class="buttonClass"
            :data-move="`${item.id}-up`"
            :disabled="index === 0 || disabled"
            :aria-label="`Move ${itemLabel(item)} up`"
            @click="moveBy(item, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            :class="buttonClass"
            :data-move="`${item.id}-down`"
            :disabled="index === items.length - 1 || disabled"
            :aria-label="`Move ${itemLabel(item)} down`"
            @click="moveBy(item, 1)"
          >
            ↓
          </button>
          <slot name="actions" :item="item" :index="index" />
        </span>
      </li>
    </ol>
    <!-- Not role="status": a page should have only one of those, and several lists can share a page. -->
    <p aria-live="polite" aria-atomic="true" class="sr-only">{{ notice }}</p>
  </div>
</template>
