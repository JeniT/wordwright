<script lang="ts">
/** How long the button must be held. One place to tune it. */
export const HOLD_MS = 900
/** How long after a screen reader's activation the button waits for the second one. */
export const ARMED_MS = 5000
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId } from 'vue'

/**
 * A button that asks for a deliberate act instead of a dialog: press and hold it until the ring fills.
 * Releasing early (or moving off it, or tabbing away) cancels. It works with the mouse, a finger and the
 * keyboard (hold Enter or Space). Assistive technology that "clicks" the button without holding it can't
 * hold, so for that the first click arms the button ("Press again to confirm") and a second one, within a few
 * seconds, confirms. Use it for deleting things that can't be got back.
 */
const props = withDefaults(defineProps<{ holdMs?: number; disabled?: boolean }>(), {
  holdMs: HOLD_MS,
  disabled: false,
})
const emit = defineEmits<{ confirm: [] }>()
defineOptions({ inheritAttrs: false })

const hintId = useId()
const holding = ref(false)
const armed = ref(false)
const announcement = ref('')
/** Where the ring is drawn: around the pointer, or over the button for the keyboard. */
const ring = ref({ x: 0, y: 0 })
const button = ref<HTMLButtonElement>()

let timer: ReturnType<typeof setTimeout> | undefined
let armedTimer: ReturnType<typeof setTimeout> | undefined
/** When a press or key last ended: the click that follows it is part of that hold, not a separate act. */
let lastHoldEvent = -Infinity
const wasJustHeld = () => Date.now() - lastHoldEvent < 500

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const motionReduced = ref(reducedMotion())

function start(x: number, y: number) {
  if (props.disabled || holding.value) return
  disarm()
  ring.value = { x, y }
  holding.value = true
  announcement.value = 'Keep holding to confirm.'
  timer = setTimeout(() => {
    finish()
    announcement.value = 'Confirmed.'
    emit('confirm')
  }, props.holdMs)
}
function finish() {
  clearTimeout(timer)
  holding.value = false
  lastHoldEvent = Date.now()
}
function cancel() {
  if (!holding.value) return
  finish()
  announcement.value = 'Cancelled. Nothing was changed.'
}
function disarm() {
  clearTimeout(armedTimer)
  armed.value = false
}
onBeforeUnmount(() => {
  clearTimeout(timer)
  clearTimeout(armedTimer)
})

// ---- pointer: a mouse, a finger or a pen
/** On a touch screen the finger would hide a ring under it, so the ring is drawn above. */
const lift = (event: PointerEvent) => (event.pointerType === 'touch' ? 48 : 0)
function onPointerDown(event: PointerEvent) {
  if (event.button > 0) return // only the main button
  // Keep the pointer's events even when it drifts off the button; leaving is checked in onPointerMove.
  button.value?.setPointerCapture?.(event.pointerId)
  start(event.clientX, event.clientY - lift(event))
}
function onPointerEnd() {
  lastHoldEvent = Date.now() // the click that follows belongs to this press, even after a long hold
  cancel()
}
function onPointerMove(event: PointerEvent) {
  if (!holding.value) return
  const rect = button.value?.getBoundingClientRect()
  const outside =
    !!rect &&
    rect.width > 0 &&
    (event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom)
  if (outside) return cancel()
  ring.value = { x: event.clientX, y: event.clientY - lift(event) }
}

// ---- keyboard: hold Enter or Space
function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault() // no click on keyup: only a full hold counts
  if (event.repeat) return
  const rect = button.value?.getBoundingClientRect()
  start((rect?.left ?? 0) + (rect?.width ?? 0) / 2, (rect?.top ?? 0) + (rect?.height ?? 0) / 2)
}
function onKeyUp(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  lastHoldEvent = Date.now()
  cancel()
}

// ---- a click that no hold led to (assistive technology): ask twice instead
function onClick() {
  if (props.disabled || wasJustHeld()) return
  if (armed.value) {
    disarm()
    announcement.value = 'Confirmed.'
    emit('confirm')
    return
  }
  armed.value = true
  announcement.value = 'Press again to confirm.'
  armedTimer = setTimeout(() => {
    armed.value = false
    announcement.value = 'Cancelled. Nothing was changed.'
  }, ARMED_MS)
}

const durationStyle = computed(() => ({ animationDuration: `${props.holdMs}ms` }))
const ringStyle = computed(() => ({ left: `${ring.value.x}px`, top: `${ring.value.y}px` }))
</script>

<template>
  <button
    ref="button"
    v-bind="$attrs"
    type="button"
    :disabled="disabled"
    :aria-describedby="hintId"
    class="touch-none select-none [-webkit-touch-callout:none]"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @contextmenu.prevent
    @keydown="onKeyDown"
    @keyup="onKeyUp"
    @blur="cancel"
    @click="onClick"
  >
    <template v-if="armed">Press again to confirm</template>
    <template v-else-if="holding && motionReduced">Keep holding…</template>
    <slot v-else />
    <span
      v-if="holding && !motionReduced"
      data-testid="hold-ring"
      aria-hidden="true"
      class="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 text-accent"
      :style="ringStyle"
    >
      <svg width="44" height="44" viewBox="0 0 44 44" class="-rotate-90 drop-shadow">
        <circle
          cx="22"
          cy="22"
          r="17"
          fill="var(--color-surface)"
          fill-opacity="0.9"
          stroke="var(--color-line-strong)"
          stroke-width="5"
        />
        <circle
          class="hold-fill"
          :style="durationStyle"
          cx="22"
          cy="22"
          r="17"
          fill="none"
          stroke="currentColor"
          stroke-width="5"
          stroke-linecap="round"
          pathLength="100"
        />
      </svg>
    </span>
  </button>
  <span :id="hintId" class="sr-only">
    Press and hold to confirm. Letting go early cancels. If you can't hold, activate it once to arm
    it and again to confirm.
  </span>
  <span class="sr-only" aria-live="polite">{{ announcement }}</span>
</template>

<style scoped>
.hold-fill {
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  animation-name: hold-fill;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}
@keyframes hold-fill {
  to {
    stroke-dashoffset: 0;
  }
}
</style>
