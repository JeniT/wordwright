<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { RouterLink } from 'vue-router'
import ProfileGate from '../components/ProfileGate.vue'
import RecentNotes from '../components/RecentNotes.vue'
import StepHeading from '../components/StepHeading.vue'
import { api } from '../lib/api'

/**
 * A profile's landing page: a short summary of each of its steps, with the quick action for each. It is not a
 * numbered step, so nothing in the menu is current here. Visiting spends nothing.
 */
const props = defineProps<{ profileId: string }>()
const ideas = useQuery({
  queryKey: ['ideas', () => props.profileId],
  queryFn: () => api.listIdeas(props.profileId),
})
</script>

<template>
  <ProfileGate :profile-id="profileId">
    <StepHeading>Overview</StepHeading>

    <RecentNotes
      heading-id="home-notes-heading"
      :profile-id="profileId"
      :idea-id="null"
      :to="{ name: 'profile-notes', params: { profileId } }"
    />

    <section aria-labelledby="home-ideas-heading" class="mb-10">
      <div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="home-ideas-heading" class="font-display text-xl font-semibold">Ideas</h2>
        <div class="flex items-baseline gap-4">
          <RouterLink :to="{ name: 'profile-ideas', params: { profileId } }" class="link text-sm">
            See all ideas
          </RouterLink>
          <RouterLink :to="{ name: 'new-idea', params: { profileId } }" class="btn btn-outline">
            New idea
          </RouterLink>
        </div>
      </div>
      <p v-if="ideas.isPending.value" class="text-ink-soft">Loading…</p>
      <p v-else-if="ideas.isError.value" role="alert" class="text-danger">
        Couldn't load ideas. Try reloading the page.
      </p>
      <p v-else-if="!ideas.data.value?.length" class="text-ink-soft">
        No ideas yet. When a group of notes feels like something you’d write about, start an idea.
      </p>
      <ul v-else class="panel divide-y divide-line">
        <li v-for="idea in ideas.data.value" :key="idea.id">
          <RouterLink
            :to="{ name: 'idea', params: { profileId, id: idea.id } }"
            class="flex items-baseline justify-between gap-3 px-4 py-3 no-underline hover:bg-sunken"
          >
            <span class="font-semibold">{{ idea.name }}</span>
            <span class="meta shrink-0">
              {{ idea.draftCount }} {{ idea.draftCount === 1 ? 'draft' : 'drafts' }}
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>
  </ProfileGate>
</template>
