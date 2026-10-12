<script setup lang="ts">
import { RouterLink } from 'vue-router'
import LandingSection from '../components/LandingSection.vue'
import ProfileDescription from '../components/ProfileDescription.vue'
import ProfileGate from '../components/ProfileGate.vue'
import ProfileImage from '../components/ProfileImage.vue'
import RecentNotes from '../components/RecentNotes.vue'
import RecentPostsSummary from '../components/RecentPostsSummary.vue'
import RecentReading from '../components/RecentReading.vue'
import { useIdeas } from '../lib/queries'
import { displayHost } from '../lib/useProfiles'
import QueryState from '../components/QueryState.vue'

/**
 * A profile's landing page: a short summary of each of its steps, with the quick action for each. It is not a
 * numbered step, so nothing in the menu is current here. Visiting spends nothing.
 */
const props = defineProps<{ profileId: string }>()
const ideas = useIdeas(() => props.profileId)
</script>

<template>
  <ProfileGate v-slot="{ profile }" :profile-id="profileId">
    <div class="mb-2 flex items-center gap-4">
      <ProfileImage :id="profile.id" :name="profile.name" :image-url="profile.imageUrl" size="sm" />
      <div class="min-w-0">
        <h1 class="h1 break-words">{{ profile.name }}</h1>
        <p v-if="profile.siteUrl" class="meta truncate">
          <a :href="profile.siteUrl" target="_blank" rel="noopener noreferrer" class="link">
            {{ displayHost(profile.siteUrl) }}
            <span class="sr-only">(opens in a new tab)</span>
          </a>
        </p>
      </div>
    </div>

    <ProfileDescription :profile-id="profileId" :description="profile.description" />

    <RecentPostsSummary :profile-id="profileId" :to="{ name: 'search', params: { profileId } }" />

    <RecentReading
      :profile-id="profileId"
      :idea-id="null"
      :to="{ name: 'read', params: { profileId } }"
    />

    <RecentNotes
      :profile-id="profileId"
      :idea-id="null"
      :to="{ name: 'profile-notes', params: { profileId } }"
    />

    <LandingSection level="profile" step="ideas" title="Ideas">
      <template #actions>
        <RouterLink :to="{ name: 'profile-ideas', params: { profileId } }" class="link text-sm">
          See all ideas
        </RouterLink>
        <RouterLink :to="{ name: 'new-idea', params: { profileId } }" class="btn btn-outline">
          New idea
        </RouterLink>
      </template>
      <QueryState :query="ideas" what="ideas">
        <p v-if="!ideas.data.value?.length" class="text-ink-soft">
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
      </QueryState>
    </LandingSection>
  </ProfileGate>
</template>
