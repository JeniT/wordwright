<script setup lang="ts">
import { computed, useId, useTemplateRef, watchEffect } from 'vue'

/**
 * The top row of a list of items: the select-all checkbox above the rail of row checkboxes, then the filters on the
 * left, and the actions that apply to the selected items on the right. Actions are always shown, and disabled until
 * something is selected, so the row never jumps. Selecting all means all the items on this page; when the filtered
 * list has more pages, "Select all N" offers the rest. Put it first inside the list's panel.
 */
const props = defineProps<{
  /** How many items this page shows, and how many of all (filtered) items there are. */
  pageSize: number
  total: number
  /** How many are selected, counting any not on this page. */
  selected: number
  /** How many of the selected ones are on this page. */
  selectedOnPage: number
  /** What the items are called, plural: "links". */
  noun: string
}>()
const emit = defineEmits<{ 'toggle-page': [on: boolean]; 'select-everything': [] }>()

const id = useId()
const box = useTemplateRef<HTMLInputElement>('box')
const all = computed(() => props.pageSize > 0 && props.selectedOnPage === props.pageSize)
const some = computed(() => props.selectedOnPage > 0 && !all.value)
watchEffect(() => {
  if (box.value) box.value.indeterminate = some.value
})
const more = computed(() => all.value && props.total > props.selected)
</script>

<template>
  <div class="border-b border-line">
    <div class="flex items-stretch">
      <div class="list-rail !py-2 justify-center">
        <input
          :id="id"
          ref="box"
          type="checkbox"
          :checked="all"
          :disabled="!pageSize"
          :aria-label="`Select all ${noun} on this page`"
          @change="emit('toggle-page', ($event.target as HTMLInputElement).checked)"
        />
      </div>
      <div
        class="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2"
      >
        <div class="flex flex-wrap items-center gap-x-5 gap-y-1">
          <label :for="id" class="text-sm">Select all</label>
          <slot name="filters" />
        </div>
        <div
          role="group"
          :aria-label="`Actions for the selected ${noun}`"
          class="flex flex-wrap items-center gap-2"
        >
          <span class="meta" aria-live="polite" aria-atomic="true">{{ selected }} selected</span>
          <slot name="actions" />
        </div>
      </div>
    </div>
    <p v-if="more" class="meta px-4 pb-2 ps-[4.25rem]">
      All {{ selectedOnPage }} {{ noun }} on this page are selected.
      <button type="button" class="link" @click="emit('select-everything')">
        Select all {{ total }}
      </button>
    </p>
  </div>
</template>
