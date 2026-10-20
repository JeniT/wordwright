<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import PersonChip from './PersonChip.vue'

/**
 * One draft in a list, for Keep writing and the idea's Draft page alike (#310): the whole row is the link. Under the
 * title go what the page doesn't already say about where the draft lives (`context`) and when it was last changed,
 * then, for a draft the person edits, how its reviews stand. `editorName` is given where the list mixes editors.
 */
const props = defineProps<{
  to: RouteLocationRaw
  title: string
  updatedAt: string
  context?: string
  /** How its reviews stand (`draftReviewSummary`); nothing for a draft never sent for review. */
  review?: string
  /** Shows who edits the draft, as a name chip. */
  editorName?: string | null
}>()
const changed = computed(() =>
  new Date(props.updatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' }),
)
</script>

<template>
  <RouterLink :to="to" class="block min-w-0 px-4 py-3 no-underline hover:bg-sunken">
    <span class="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span class="min-w-0 text-lg font-semibold break-words">{{ title || 'Untitled draft' }}</span>
      <span v-if="editorName !== undefined"
        ><span class="sr-only">Editor: </span><PersonChip :name="editorName"
      /></span>
    </span>
    <span class="meta block">
      <template v-if="context">{{ context }} · </template><span class="sr-only">Last changed </span
      ><time :datetime="updatedAt">{{ changed }}</time>
    </span>
    <span v-if="review" class="mt-1 block text-sm text-ink-soft">{{ review }}</span>
  </RouterLink>
</template>
