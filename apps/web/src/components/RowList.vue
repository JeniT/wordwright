<script setup lang="ts" generic="T extends { id: string }">
import { useTemplateRef } from 'vue'
import { useGridKeys } from '../lib/grid-keys'
/**
 * The frame every list of records shares: a bordered box, a rule between rows, and in each row the content, then
 * its actions at the end. An optional left rail (`list-rail`) holds a select checkbox, or the grip of a
 * `ReorderableList`, which is built on this. Rows are list items, so the list says how many there are.
 *
 * The content slot takes `min-w-0 flex-1` for what should use the space between the rail and the actions; give a
 * row's own note (an explanation, an error) `basis-full` so it sits on its own line under them, inside the row.
 */
const props = defineProps<{
  items: readonly T[]
  /** Names the list for a screen reader ("People"). */
  label?: string
  /** Numbered rows, for a list whose order means something. */
  ordered?: boolean
  /**
   * The row's content fills the row itself (no padding, no actions zone), for rows that are one whole link or that
   * set their own padding.
   */
  bare?: boolean
  /** Extra attributes for a row's `li` (a class, drag handlers). */
  rowAttrs?: (item: T) => Record<string, unknown>
  /**
   * Show the toolbar even for a single row. By default it is left out then, as there is nothing to select all of or
   * act on in bulk; a list that can be filtered needs it to stay so the filter can be changed.
   */
  keepToolbar?: boolean
  /** Line the content and actions up at the top of the row, for rows that can be tall (a long note). */
  alignTop?: boolean
  /**
   * One Tab stop for the whole list, with the arrow keys moving between its rows and their controls: an ARIA grid
   * with a roving tabindex (`useGridKeys`, #459). For a list whose rows each have several controls (Notes, Drafts).
   * The rows are then `role="row"` rather than list items, so give the list a `label`.
   */
  grid?: boolean
  /**
   * Whether a row is ticked for a bulk action. A ticked row has the accent wash, which echoes its checkbox on a long
   * list; the checkbox stays the control and the signal that doesn't rely on colour.
   */
  isSelected?: (item: T) => boolean
}>()

defineSlots<{
  /** The row's content. */
  default(props: { item: T; index: number }): unknown
  /** Above the rows, inside the same frame: a `ListToolbar`. */
  toolbar?(): unknown
  /** The whole left rail of a row: an element with the `list-rail` class. */
  rail?(props: { item: T; index: number }): unknown
  /** Buttons at the end of the row. */
  actions?(props: { item: T; index: number }): unknown
}>()
const rows = useTemplateRef<HTMLElement>('rows')
// Only a grid has the arrow keys; a plain list keeps the ordinary Tab order.
useGridKeys(() => (props.grid ? rows.value : null))
</script>

<template>
  <div class="group/rows overflow-hidden rounded-ctl border border-line bg-surface">
    <slot v-if="keepToolbar || items.length > 1" name="toolbar" />
    <component
      :is="grid ? 'div' : ordered ? 'ol' : 'ul'"
      ref="rows"
      :role="grid ? 'grid' : undefined"
      :aria-label="label"
      class="divide-y divide-line"
    >
      <component
        :is="grid ? 'div' : 'li'"
        v-for="(item, index) in items"
        :key="item.id"
        :role="grid ? 'row' : undefined"
        class="flex items-stretch"
        :class="{ 'bg-accent-wash': isSelected?.(item) }"
        :data-selected="isSelected?.(item) || undefined"
        v-bind="rowAttrs?.(item)"
      >
        <div v-if="grid && $slots.rail" role="gridcell" class="flex">
          <slot name="rail" :item="item" :index="index" />
        </div>
        <slot v-else name="rail" :item="item" :index="index" />
        <div v-if="bare" :role="grid ? 'gridcell' : undefined" class="min-w-0 flex-1">
          <slot :item="item" :index="index" />
        </div>
        <div
          v-else
          :role="grid ? 'gridcell' : undefined"
          class="flex min-h-14 min-w-0 flex-1 flex-wrap gap-x-3 gap-y-2 px-3 py-2"
          :class="alignTop ? 'items-start' : 'items-center'"
        >
          <slot :item="item" :index="index" />
          <span v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-1">
            <slot name="actions" :item="item" :index="index" />
          </span>
        </div>
      </component>
    </component>
    <!-- For a sighted keyboard user, who can't hear that this is a grid: only while one of its controls has the
         keyboard's focus. A screen reader already says "grid", so it is hidden from one. -->
    <p
      v-if="grid"
      aria-hidden="true"
      class="hidden border-t border-line px-3 py-1.5 text-xs text-ink-soft group-has-[[role=grid]_:focus-visible]/rows:block"
    >
      Arrow keys move between the rows and their controls. Tab leaves the list.
    </p>
  </div>
</template>
