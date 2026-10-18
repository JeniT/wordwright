<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import { readingRoute, useReadingList } from '../lib/reading'
import LandingSection from './LandingSection.vue'
import QueryState from './QueryState.vue'
import RowList from './RowList.vue'

/**
 * A summary of a reading list for a landing page: the first few items still to read, and a link
 * to the whole list. It shares the list's query, so an item added here is on the Read page at once.
 */
const props = defineProps<{
  publicationId: string
  /** The idea whose list this is, or null for the publication's own. */
  ideaId: string | null
  /** The page this summarises. */
  to: RouteLocationRaw
  /** An idea keeps its reading list under Research. */
  step?: 'read' | 'research'
  title?: string
  nested?: boolean
  explain?: string
}>()
const SHOWN = 5

const list = useReadingList(() => ({ publicationId: props.publicationId, ideaId: props.ideaId }))
// Read items are out of the way on the full list by default, and so they are here.
const unread = computed(() => (list.links.value ?? []).filter((l) => !l.readAt))
const top = computed(() => unread.value.slice(0, SHOWN))
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
</script>

<template>
  <LandingSection
    :level="ideaId ? 'idea' : 'publication'"
    :step="step ?? 'read'"
    :title="title ?? 'Read'"
    :nested="nested"
    :explain="explain"
  >
    <template #actions>
      <RouterLink :to="to" class="link text-sm"> See the reading list </RouterLink>
    </template>
    <QueryState :query="list" what="the reading list">
      <p v-if="!top.length" class="text-ink-soft">
        {{
          list.links.value?.length
            ? 'You have read everything on the list.'
            : 'Nothing on the reading list yet.'
        }}
      </p>
      <RowList v-else :items="top" label="To read" bare>
        <template #default="{ item: link }">
          <RouterLink
            :to="readingRoute({ publicationId, ideaId }, link.id)"
            class="block px-4 py-3 no-underline hover:bg-sunken"
          >
            <span class="block font-medium break-words">{{ link.title || link.url }}</span>
            <span class="meta block break-words">
              {{ host(link.url)
              }}<template v-if="link.authors.length"> · {{ link.authors.join(', ') }}</template>
            </span>
          </RouterLink>
        </template>
      </RowList>
    </QueryState>
  </LandingSection>
</template>
