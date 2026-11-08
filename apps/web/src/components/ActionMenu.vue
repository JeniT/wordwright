<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue'
import Icon from './Icon.vue'
import { vTip } from '../lib/tip'

/**
 * The "…" button of a list row: the row's actions (Edit, Tag, Move, Remove) folded behind one 32px button, so a long
 * title keeps the whole width of a phone. The actions are ordinary buttons in the default slot, which is given `close`
 * (call it when an item's job is done; a press-and-hold Remove stays open while it asks "Remove?").
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
const emit = defineEmits<{ close: [] }>()

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

async function show(focus: 'first' | 'last' | null = 'first') {
  if (open.value) return
  open.value = true
  await nextTick()
  place()
  const list = items()
  const target = focus === 'last' ? list[list.length - 1] : list[0]
  if (focus) target?.focus()
}

/** Puts the menu away. Focus goes back to the "…" button unless something else (a dialog, a field) is taking it. */
function hide(returnFocus = true) {
  if (!open.value) return
  open.value = false
  emit('close')
  if (returnFocus) void nextTick(() => trigger.value?.focus())
}

function toggle() {
  if (open.value) hide()
  else void show(null).then(() => items()[0]?.focus())
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
    hide()
  }
}
/** Focus moved on from the panel (Tab past its last button, or Shift+Tab before its first): put it away. */
function onFocusout(event: FocusEvent) {
  const to = event.relatedTarget as Node | null
  if (to && !panel.value?.contains(to) && to !== trigger.value) hide(false)
}

function onOutside(event: Event) {
  const target = event.target as Node
  if (panel.value?.contains(target) || trigger.value?.contains(target)) return
  hide(false)
}
/** The panel follows its button when the page scrolls or resizes, rather than floating away from its row. */
function onMove() {
  place()
}
watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onOutside, true)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
  } else {
    document.removeEventListener('pointerdown', onOutside, true)
    window.removeEventListener('scroll', onMove, true)
    window.removeEventListener('resize', onMove)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutside, true)
  window.removeEventListener('scroll', onMove, true)
  window.removeEventListener('resize', onMove)
})

defineExpose({
  focus: () => trigger.value?.focus(),
  close: hide,
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
    <slot :close="hide" />
  </div>
</template>
