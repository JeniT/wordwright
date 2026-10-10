<script setup lang="ts" generic="T extends { id: string }">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

/**
 * An ordered list that people can rearrange: drag a row by its grip (the mouse route), or use the
 * arrow buttons (the keyboard and touch route; native drag and drop doesn't work on most touch
 * screens). It only decides the new order; `save` stores it. Use it wherever order matters, so
 * those lists look and behave alike.
 *
 * A new order is shown at once and saved in the background, so a slow connection never makes a
 * move feel stuck. While that happens the list keeps its own *pending* order and ignores what
 * `items` says, which can still be the old order, or the answer to an earlier save. Saves go one at
 * a time, each carrying the whole order as it is shown then, so several quick moves become at most
 * one save in flight and one waiting, and replies can't arrive out of order. If a save fails, the
 * list goes back to the saved order in `items` and says so; the parent shows the reason.
 */
const props = defineProps<{
  items: readonly T[]
  /** What to call a row: names its buttons ("Move … up") and the announcement after a move. */
  itemLabel: (item: T) => string
  /** Stores the complete new order (every id). Resolves true if it was saved. */
  save: (ids: string[], moved: T) => Promise<boolean>
}>()

defineSlots<{
  /** The row's content; give it `min-w-0 flex-1` so it takes the space between grip and buttons. */
  default(props: { item: T; index: number }): unknown
  /** Extra buttons after the arrows, e.g. Remove. */
  actions?(props: { item: T; index: number }): unknown
}>()

const notice = ref('') // announced politely to screen readers after each move

// ---- the order on screen
/** The order the person has made that isn't yet confirmed as saved, or null to show `items` as they are. */
const pending = ref<string[] | null>(null)
const shown = computed<readonly T[]>(() => {
  const order = pending.value
  if (!order) return props.items
  const byId = new Map(props.items.map((item) => [item.id, item]))
  const known = new Set(order)
  // Rows that arrived meanwhile (someone else added one) go last; rows that went are dropped.
  return [
    ...order.flatMap((id) => byId.get(id) ?? []),
    ...props.items.filter((item) => !known.has(item.id)),
  ]
})
const shownIds = () => shown.value.map((item) => item.id)

// ---- saving: one at a time, always the order as it is shown by then
let saving = false
let queued: T | null = null // the row moved last, if a move is waiting for the save in flight
/** Every save so far worked, so `items` should soon say what is on screen. */
let confirmed = false
let releaseTimer: ReturnType<typeof setTimeout> | undefined

/** The saved order, as far as the rows on screen go, is the one that is shown. */
function itemsMatchPending() {
  const order = pending.value
  if (!order) return true
  const inItems = new Set(props.items.map((item) => item.id))
  const inOrder = new Set(order)
  const saved = props.items.map((item) => item.id).filter((id) => inOrder.has(id))
  return saved.join() === order.filter((id) => inItems.has(id)).join()
}

/**
 * Goes back to showing `items` once every save has worked and `items` has caught up. Dropping the
 * pending order sooner would flash the old order for a moment, because the parent updates `items`
 * a little after the save resolves.
 */
function release() {
  if (!confirmed || saving || queued || !pending.value) return
  if (!itemsMatchPending()) return
  pending.value = null
  confirmed = false
  clearTimeout(releaseTimer)
}
watch(() => props.items, release)
onBeforeUnmount(() => clearTimeout(releaseTimer))

async function flush() {
  if (saving) return
  saving = true
  let failed = false
  try {
    while (queued) {
      const moved = queued
      queued = null
      const saved = await props.save(shownIds(), moved).catch(() => false)
      if (!saved) {
        failed = true
        break
      }
    }
  } finally {
    saving = false
  }
  if (failed) {
    // A later move was built on the order that didn't save, so it is dropped too.
    queued = null
    confirmed = false
    pending.value = null
    notice.value = 'The new order could not be saved. The list is back to the saved order.'
    return
  }
  confirmed = true
  release()
  // If the parent never brings `items` into line, don't show a stale pending order for ever.
  if (pending.value) {
    releaseTimer = setTimeout(() => {
      if (!saving && !queued) {
        pending.value = null
        confirmed = false
      }
    }, 3000)
  }
}

/** Shows `ids` now, tells the person, and saves it. */
function arrange(ids: string[], moved: T) {
  confirmed = false
  clearTimeout(releaseTimer)
  pending.value = ids
  notice.value = `Moved ${props.itemLabel(moved)} to position ${ids.indexOf(moved.id) + 1} of ${ids.length}`
  queued = moved
  void flush()
}

// ---- buttons
async function moveBy(item: T, offset: -1 | 1) {
  const ids = shownIds()
  const from = ids.indexOf(item.id)
  const to = from + offset
  if (from < 0 || to < 0 || to >= ids.length) return
  ids.splice(to, 0, ...ids.splice(from, 1))
  arrange(ids, item)
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

/**
 * A small label to carry under the pointer, in place of a picture of the whole row. Chrome on macOS
 * was slow to finish a drag that used a large drag image (the dropped row stayed faded until the
 * mouse moved), and a label says what is being moved without covering the rows it is moving past.
 * The browser needs the element in the document, painted, when it copies it; it is removed straight
 * after, and in any case when the drag ends.
 */
let label: HTMLElement | null = null
function removeLabel() {
  label?.remove()
  label = null
}
onBeforeUnmount(removeLabel)

function dragLabel(text: string) {
  removeLabel()
  const mine = document.createElement('div')
  label = mine
  mine.textContent = text
  mine.setAttribute('aria-hidden', 'true')
  mine.className =
    'max-w-xs truncate rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 shadow'
  mine.style.cssText = 'position:fixed;top:-1000px;left:0;pointer-events:none'
  document.body.appendChild(mine)
  setTimeout(() => {
    mine.remove()
    if (label === mine) label = null
  }, 0)
  return mine
}

function onDragStart(event: DragEvent, item: T) {
  draggingId.value = item.id
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  const name = props.itemLabel(item)
  event.dataTransfer.setData('text/plain', name) // Firefox only starts a drag if there is data
  event.dataTransfer.setDragImage(dragLabel(name), 12, 12)
}

function onDragOver(event: DragEvent, item: T) {
  if (!draggingId.value) return // something else (a file, some text) is being dragged
  event.preventDefault() // allows dropping here
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const after = event.clientY > rect.top + rect.height / 2
  // The browser repeats this event many times a second, even with the pointer still. Only a change
  // of place is worth redrawing the list for.
  if (over.value?.id !== item.id || over.value.after !== after) over.value = { id: item.id, after }
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  const dragged = shown.value.find((item) => item.id === draggingId.value)
  const target = over.value
  endDrag()
  if (!dragged || !target || target.id === dragged.id) return
  const before = shownIds()
  const ids = before.filter((id) => id !== dragged.id)
  const at = ids.indexOf(target.id) + (target.after ? 1 : 0)
  ids.splice(at, 0, dragged.id)
  if (ids.join() === before.join()) return
  arrange(ids, dragged)
}

function endDrag() {
  draggingId.value = null
  over.value = null
  removeLabel()
}

const buttonClass =
  'rounded border border-stone-300 bg-white px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'
</script>

<template>
  <div>
    <ol class="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
      <li
        v-for="(item, index) in shown"
        :key="item.id"
        class="flex flex-wrap items-center gap-x-3 gap-y-2 border-y-2 border-transparent px-3 py-2"
        :class="{
          'opacity-50': draggingId === item.id,
          'border-t-accent': over?.id === item.id && !over.after && draggingId !== item.id,
          'border-b-accent': over?.id === item.id && over.after && draggingId !== item.id,
        }"
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
            :disabled="index === 0"
            :aria-label="`Move ${itemLabel(item)} up`"
            @click="moveBy(item, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            :class="buttonClass"
            :data-move="`${item.id}-down`"
            :disabled="index === shown.length - 1"
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
