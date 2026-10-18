<script setup lang="ts">
import { computed, useId, useTemplateRef, watch, watchEffect } from 'vue'
import Icon from './Icon.vue'
import { vTip } from '../lib/tip'

/**
 * The top of a list of items: the select-all checkbox above the rail of row checkboxes, a filter button (a funnel)
 * beside it, and, once something is selected, the actions that apply to the selected items on the right.
 *
 * - The filters are folded away: the funnel opens a row of them under the header, and says what is filtering while
 *   it is closed.
 * - The actions appear only when something is selected. An action that needs input (Tag, Move to…) takes over the
 *   header while its form is open (`form-open`): the other actions go, the `form` slot fills the header, and a tick
 *   (confirm) and a cross (cancel) end it, as icons to leave room. Long explanations belong behind an `InfoTip`.
 * - Selecting all means the items this page shows, after any filter; when the filtered list has more pages,
 *   "Select all N" offers the rest.
 *
 * Put it first inside the list's panel.
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
  /** There is something to filter by, so the funnel is offered. */
  canFilter?: boolean
  /** A filter is on, and what it is ("part 1"), shown beside the funnel while the filters are folded away. */
  filterSummary?: string
  /** An action's form is open, and takes over the header. */
  formOpen?: boolean
  /** What the form's tick does, as a name ("Tag 3 notes"), and whether it can be pressed now. */
  confirmLabel?: string
  canConfirm?: boolean
}>()
const emit = defineEmits<{
  'toggle-page': [on: boolean]
  'select-everything': []
  confirm: []
  cancel: []
}>()
/** Whether the row of filters is open. */
const filtering = defineModel<boolean>('filtering', { default: false })

const id = useId()
const box = useTemplateRef<HTMLInputElement>('box')
const all = computed(() => props.pageSize > 0 && props.selectedOnPage === props.pageSize)
const some = computed(() => props.selectedOnPage > 0 && !all.value)
watchEffect(() => {
  if (box.value) box.value.indeterminate = some.value
})
const more = computed(() => all.value && props.total > props.selected)
const filtersOpen = computed(() => filtering.value && !!props.canFilter && !props.formOpen)
const filtersId = `${id}-filters`
// A form for nothing makes no sense: if the selection empties (a filter, a delete), the form closes.
watch(
  () => props.selected,
  (n) => {
    if (n === 0 && props.formOpen) emit('cancel')
  },
)
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
      <!-- An action's form: the whole header, ending in tick and cross. -->
      <form
        v-if="formOpen"
        class="flex min-w-0 flex-1 items-start gap-2 px-4 py-2"
        :aria-label="confirmLabel"
        @submit.prevent="canConfirm && emit('confirm')"
      >
        <div class="min-w-0 flex-1">
          <slot name="form" />
        </div>
        <div class="flex shrink-0 gap-1">
          <button
            v-tip="confirmLabel"
            type="submit"
            class="btn btn-sm btn-icon btn-primary"
            :disabled="!canConfirm"
            :aria-label="confirmLabel"
          >
            <Icon name="check" :size="16" />
          </button>
          <button
            v-tip="'Cancel'"
            type="button"
            class="btn btn-sm btn-icon btn-ghost"
            aria-label="Cancel"
            @click="emit('cancel')"
          >
            <Icon name="close" :size="16" />
          </button>
        </div>
      </form>
      <div
        v-else
        class="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2"
      >
        <div class="flex flex-wrap items-center gap-x-5 gap-y-1">
          <label :for="id" class="text-sm">Select all</label>
          <span v-if="canFilter" class="inline-flex items-center gap-2">
            <button
              v-tip="'Filter'"
              type="button"
              class="btn btn-sm btn-icon btn-ghost"
              :class="{ '!bg-accent-wash !text-accent': filterSummary }"
              :aria-expanded="filtersOpen"
              :aria-controls="filtersId"
              :aria-label="filterSummary ? `Filter (on: ${filterSummary})` : 'Filter'"
              @click="filtering = !filtering"
            >
              <Icon name="filter" :size="16" />
            </button>
            <span v-if="filterSummary && !filtersOpen" class="chip chip-quiet">{{
              filterSummary
            }}</span>
          </span>
        </div>
        <div
          v-if="selected > 0"
          role="group"
          :aria-label="`Actions for the selected ${noun}`"
          class="flex flex-wrap items-center gap-2"
        >
          <span class="meta" aria-live="polite" aria-atomic="true">{{ selected }} selected</span>
          <slot name="actions" />
        </div>
        <span v-else class="sr-only" aria-live="polite" aria-atomic="true">0 selected</span>
      </div>
    </div>
    <div
      v-if="filtersOpen"
      :id="filtersId"
      class="flex items-center justify-between gap-3 border-t border-line bg-sunken px-4 py-2 ps-[4.25rem]"
    >
      <div class="flex flex-wrap items-center gap-x-5 gap-y-1">
        <slot name="filters" />
      </div>
      <button
        v-tip="'Close the filters'"
        type="button"
        class="btn btn-sm btn-icon btn-ghost shrink-0"
        aria-label="Close the filters"
        @click="filtering = false"
      >
        <Icon name="close" :size="16" />
      </button>
    </div>
    <p v-if="more && !formOpen" class="meta px-4 pb-2 ps-[4.25rem]">
      All {{ selectedOnPage }} {{ noun }} on this page are selected.
      <button type="button" class="link" @click="emit('select-everything')">
        Select all {{ total }}
      </button>
    </p>
  </div>
</template>
