<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue'
import Icon from './Icon.vue'
import { vTip } from '../lib/tip'

/**
 * The "…" button of a list row: the row's actions (Edit, Tag, Move, Remove) folded behind one 32px button, so a long
 * title keeps the whole width of a phone. The actions are ordinary buttons in the default slot, which is given two
 * ways to put the menu away when an item's job is done: `close` (focus goes back to "…") and `release` (for an action
 * that sends focus somewhere else, such as a field). A press-and-hold Remove calls neither: it stays open while it asks
 * "Remove?" and goes with its row.
 *
 * It is a disclosure, not an ARIA `menu` (a `menu` may own only menu items, and a press-and-hold button carries a hint
 * and a live region of its own). The keyboard still works the way a menu does: Enter, Space or the Down arrow opens it
 * on the first button; Up and Down, Home and End move; Escape closes it and focus goes back to the "…" button; Tab on
 * from the last button, or a press outside, closes it. The panel sits right after the button (so it stays in the
 * page's landmark and reading order) but is positioned with `fixed`, so a list that clips its children can't cut it
 * off; it follows its button if the page scrolls or resizes.
 */
const props = defineProps<{
  /** What the actions are for, for the button's name: "Actions for A paper". */
  label: string
}>()

const MARGIN_PX = 8
const GAP_PX = 2

const menuId = useId()
const open = ref(false)
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const panel = useTemplateRef<HTMLElement>('panel')
const position = ref({ top: 0, left: 0 })

const items = () =>
  Array.from(panel.value?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])

function place() {
  const anchor = trigger.value?.getBoundingClientRect()
  const box = panel.value?.getBoundingClientRect()
  if (!anchor || !box) return
  const width = document.documentElement.clientWidth
  const left = Math.max(
    MARGIN_PX,
    Math.min(anchor.right - box.width, width - box.width - MARGIN_PX),
  )
  const below = anchor.bottom + GAP_PX
  const fitsBelow = below + box.height <= window.innerHeight - MARGIN_PX
  position.value = {
    left,
    top: fitsBelow ? below : Math.max(MARGIN_PX, anchor.top - GAP_PX - box.height),
  }
}

/** Opens the panel with focus on its first or last button. */
async function show(start: 'first' | 'last' = 'first') {
  if (open.value) return
  open.value = true
  await nextTick()
  place()
  const list = items()
  list[start === 'last' ? list.length - 1 : 0]?.focus()
}

function close() {
  open.value = false
  void nextTick(() => trigger.value?.focus())
}
/** Puts the menu away without moving focus: the action that was chosen is taking it elsewhere. */
function release() {
  open.value = false
}

function toggle() {
  if (open.value) close()
  else void show()
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    void show('first')
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    void show('last')
  }
}

function onPanelKeydown(event: KeyboardEvent) {
  const list = items()
  const at = list.indexOf(document.activeElement as HTMLElement)
  const go = (index: number) => {
    event.preventDefault()
    list[(index + list.length) % list.length]?.focus()
  }
  if (event.key === 'ArrowDown') go(at + 1)
  else if (event.key === 'ArrowUp') go(at < 0 ? -1 : at - 1)
  else if (event.key === 'Home') go(0)
  else if (event.key === 'End') go(-1)
  else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
  }
}
/** Focus moved on from the panel (Tab past its last button, or Shift+Tab before its first): put it away. */
function onFocusout(event: FocusEvent) {
  const to = event.relatedTarget as Node | null
  if (to && !panel.value?.contains(to) && to !== trigger.value) release()
}

function onOutside(event: Event) {
  const target = event.target as Node
  if (panel.value?.contains(target) || trigger.value?.contains(target)) return
  release()
}
/** Listens while open: a press elsewhere puts the panel away; scrolling or resizing moves it with its button. */
function listen(on: boolean) {
  const change = on ? 'addEventListener' : 'removeEventListener'
  document[change]('pointerdown', onOutside, true)
  window[change]('scroll', place, true)
  window[change]('resize', place)
}
watch(open, listen)
onBeforeUnmount(() => listen(false))

defineExpose({
  focus: () => trigger.value?.focus(),
  close,
  /** The "…" button, for code that gives focus back to it. */
  button: () => trigger.value,
})
</script>

<template>
  <button
    ref="trigger"
    v-tip="'More actions'"
    type="button"
    class="btn btn-sm btn-icon btn-ghost"
    :aria-label="`Actions for ${props.label}`"
    :aria-expanded="open"
    :aria-controls="open ? menuId : undefined"
    @click="toggle"
    @keydown="onTriggerKeydown"
  >
    <Icon name="more" />
  </button>
  <div
    v-if="open"
    :id="menuId"
    ref="panel"
    role="group"
    :aria-label="`Actions for ${props.label}`"
    class="fixed z-40 flex min-w-44 flex-col rounded-ctl border border-line-strong bg-surface p-1"
    :style="{ top: `${position.top}px`, left: `${position.left}px` }"
    @keydown="onPanelKeydown"
    @focusout="onFocusout"
  >
    <slot :close="close" :release="release" />
  </div>
</template>
