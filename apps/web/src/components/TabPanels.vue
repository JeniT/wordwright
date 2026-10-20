<script setup lang="ts">
import { useId } from 'vue'

/**
 * Tabs that follow the WAI-ARIA pattern: one tab in the tab order at a time, arrow keys / Home / End move between
 * them (and show their panel), each panel is labelled by its tab. Every panel stays mounted, only hidden, so what is
 * in one (a half-typed note, a drag in progress) is not lost when another is shown. Put each panel's content in the
 * slot named after the tab's `id`.
 */
const props = defineProps<{
  /** `count` is shown on the tab and said to a screen reader ("Comments, 3"); leave it out for none. */
  tabs: { id: string; label: string; count?: number }[]
  /** Names the tab list for a screen reader. */
  label: string
}>()
const selected = defineModel<string>({ required: true })
const prefix = useId()
const tabId = (id: string) => `${prefix}-tab-${id}`
const panelId = (id: string) => `${prefix}-panel-${id}`

function onKeydown(event: KeyboardEvent) {
  const last = props.tabs.length - 1
  const at = props.tabs.findIndex((t) => t.id === selected.value)
  const to =
    event.key === 'ArrowRight'
      ? (at + 1) % props.tabs.length
      : event.key === 'ArrowLeft'
        ? (at - 1 + props.tabs.length) % props.tabs.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : -1
  if (to < 0) return
  event.preventDefault()
  selected.value = props.tabs[to]!.id
  document.getElementById(tabId(props.tabs[to]!.id))?.focus()
}
</script>

<template>
  <div>
    <div role="tablist" :aria-label="label" class="mb-3 flex flex-wrap border-b border-line">
      <button
        v-for="t in tabs"
        :id="tabId(t.id)"
        :key="t.id"
        type="button"
        role="tab"
        class="tab"
        :aria-selected="t.id === selected"
        :aria-controls="panelId(t.id)"
        :aria-label="t.count ? `${t.label}, ${t.count}` : undefined"
        :tabindex="t.id === selected ? 0 : -1"
        @click="selected = t.id"
        @keydown="onKeydown"
      >
        {{ t.label }}
        <span v-if="t.count" class="chip chip-quiet" aria-hidden="true">{{ t.count }}</span>
      </button>
    </div>
    <div
      v-for="t in tabs"
      :id="panelId(t.id)"
      :key="t.id"
      role="tabpanel"
      :aria-labelledby="tabId(t.id)"
      :hidden="t.id !== selected"
    >
      <slot :name="t.id" />
    </div>
  </div>
</template>
