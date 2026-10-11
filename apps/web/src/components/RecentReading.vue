<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import { readingRoute, useReadingList } from '../lib/reading'
import AddLinkForm from './AddLinkForm.vue'
import LandingSection from './LandingSection.vue'

/**
 * A summary of a reading list for a landing page: the first few items still to read, a box to add one, and a link
 * to the whole list. It shares the list's query, so an item added here is on the Read page at once.
 */
const props = defineProps<{
  profileId: string
  /** The idea whose list this is, or null for the profile's own. */
  ideaId: string | null
  /** The page this summarises. */
  to: RouteLocationRaw
}>()
const SHOWN = 5

const list = useReadingList(() => ({ profileId: props.profileId, ideaId: props.ideaId }))
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
  <LandingSection :level="ideaId ? 'idea' : 'profile'" step="read" title="Read">
    <template #actions>
      <RouterLink :to="to" class="link text-sm">
        See the reading list<span v-if="unread.length" class="meta"> ({{ unread.length }})</span>
      </RouterLink>
    </template>
    <p v-if="list.isPending.value" class="text-ink-soft">Loading…</p>
    <p v-else-if="list.isError.value" role="alert" class="text-danger">
      Couldn't load the reading list.
      <button type="button" class="underline" @click="list.refetch()">Try again</button>
    </p>
    <p v-else-if="!top.length" class="mb-4 text-ink-soft">
      {{
        list.links.value?.length
          ? 'You have read everything on the list.'
          : 'Nothing on the reading list yet.'
      }}
    </p>
    <ul v-else class="panel mb-4 divide-y divide-line" aria-label="To read">
      <li v-for="link in top" :key="link.id">
        <RouterLink
          :to="readingRoute({ profileId, ideaId }, link.id)"
          class="block px-4 py-3 no-underline hover:bg-sunken"
        >
          <span class="block font-medium break-words">{{ link.title || link.url }}</span>
          <span class="meta block break-words">
            {{ host(link.url)
            }}<template v-if="link.authors.length"> · {{ link.authors.join(', ') }}</template>
          </span>
        </RouterLink>
      </li>
    </ul>
    <AddLinkForm :profile-id="profileId" :idea-id="ideaId" />
  </LandingSection>
</template>
