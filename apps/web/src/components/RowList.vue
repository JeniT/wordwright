<script setup lang="ts" generic="T extends { id: string }">
/**
 * The frame every list of records shares: a bordered box, a rule between rows, and in each row the content, then
 * its actions at the end. An optional left rail (`list-rail`) holds a select checkbox, or the grip of a
 * `ReorderableList`, which is built on this. Rows are list items, so the list says how many there are.
 *
 * The content slot takes `min-w-0 flex-1` for what should use the space between the rail and the actions; give a
 * row's own note (an explanation, an error) `basis-full` so it sits on its own line under them, inside the row.
 */
defineProps<{
  items: readonly T[]
  /** Names the list for a screen reader ("People"). */
  label?: string
  /** Numbered rows, for a list whose order means something. */
  ordered?: boolean
  /** Extra attributes for a row's `li` (a class, drag handlers). */
  rowAttrs?: (item: T) => Record<string, unknown>
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
</script>

<template>
  <div class="overflow-hidden rounded-ctl border border-line bg-surface">
    <slot name="toolbar" />
    <component :is="ordered ? 'ol' : 'ul'" :aria-label="label" class="divide-y divide-line">
      <li
        v-for="(item, index) in items"
        :key="item.id"
        class="flex items-stretch"
        v-bind="rowAttrs?.(item)"
      >
        <slot name="rail" :item="item" :index="index" />
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
          <slot :item="item" :index="index" />
          <span v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-1">
            <slot name="actions" :item="item" :index="index" />
          </span>
        </div>
      </li>
    </component>
  </div>
</template>
