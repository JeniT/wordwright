<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import { articleRoute, useArticleList } from '../lib/articles'
import LandingSection from './LandingSection.vue'
import QueryState from './QueryState.vue'
import RowList from './RowList.vue'

/**
 * A summary of a list of articles for a landing page: the first few items still to read, and a link
 * to the whole list. It shares the list's query, so an item added here is on the Read page at once.
 */
const props = defineProps<{
  publicationId: string
  /** The idea whose list this is, or null for the publication's own. */
  ideaId: string | null
  /** The page this summarises. */
  to: RouteLocationRaw
  nested?: boolean
  explain?: string
}>()
const SHOWN = 5

const list = useArticleList(() => ({ publicationId: props.publicationId, ideaId: props.ideaId }))
// Read items are out of the way on the full list by default, and so they are here.
const unread = computed(() => (list.articles.value ?? []).filter((l) => !l.readAt))
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
    step="read"
    title="Read"
    :nested="nested"
    :explain="explain"
  >
    <template #actions>
      <RouterLink :to="to" class="link text-sm"> See the articles </RouterLink>
    </template>
    <QueryState :query="list" what="the articles">
      <p v-if="!top.length" class="text-ink-soft">
        {{
          list.articles.value?.length
            ? 'You have read everything on the list.'
            : 'Nothing in the articles yet.'
        }}
      </p>
      <RowList v-else :items="top" label="To read" bare>
        <template #default="{ item: link }">
          <RouterLink
            :to="articleRoute({ publicationId, ideaId }, link.id)"
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
