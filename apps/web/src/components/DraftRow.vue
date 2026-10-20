<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import NewTabLink from './NewTabLink.vue'
import PersonChip from './PersonChip.vue'
import PublishedChip from './PublishedChip.vue'

/**
 * One draft in a list, for Keep writing and the idea's Draft page alike (#310): the whole row is the link. Under the
 * title go what the page doesn't already say about where the draft lives (`context`) and when it was last changed,
 * then, for a draft the person edits, how its reviews stand. `editorName` is given where the list mixes editors. A draft
 * its editor has published (#311) keeps its place and is washed green, marked with words and a tick; the link to the
 * post sits beside the row link, since a link can't be inside one.
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
  publishedAt?: string | null
  publishedUrl?: string | null
}>()
const changed = computed(() =>
  new Date(props.updatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' }),
)
</script>

<template>
  <div class="flex items-stretch" :class="{ 'bg-ok-wash': publishedAt }">
    <RouterLink
      :to="to"
      class="block min-w-0 flex-1 px-4 py-3 no-underline"
      :class="{ 'hover:bg-sunken': !publishedAt }"
    >
      <span class="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span class="min-w-0 text-lg font-semibold break-words">{{
          title || 'Untitled draft'
        }}</span>
        <span class="flex flex-wrap items-baseline gap-2">
          <PublishedChip v-if="publishedAt" :published-at="publishedAt" />
          <span v-if="editorName !== undefined"
            ><span class="sr-only">Editor: </span><PersonChip :name="editorName"
          /></span>
        </span>
      </span>
      <span class="meta block">
        <template v-if="context">{{ context }} · </template
        ><span class="sr-only">Last changed </span><time :datetime="updatedAt">{{ changed }}</time>
      </span>
      <span v-if="review" class="mt-1 block text-sm text-ink-soft">{{ review }}</span>
    </RouterLink>
    <NewTabLink
      v-if="publishedAt && publishedUrl"
      :href="publishedUrl"
      :detail="title || 'Untitled draft'"
      class="link shrink-0 self-center px-4 text-sm"
      >View post</NewTabLink
    >
  </div>
</template>
