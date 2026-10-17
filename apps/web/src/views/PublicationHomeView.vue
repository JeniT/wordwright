<script setup lang="ts">
import { RouterLink } from 'vue-router'
import NextStep from '../components/NextStep.vue'
import LandingSection from '../components/LandingSection.vue'
import PublicationAttention from '../components/PublicationAttention.vue'
import PublicationDescription from '../components/PublicationDescription.vue'
import PublicationGate from '../components/PublicationGate.vue'
import PublicationImage from '../components/PublicationImage.vue'
import RecentNotes from '../components/RecentNotes.vue'
import RecentPostsSummary from '../components/RecentPostsSummary.vue'
import RecentReading from '../components/RecentReading.vue'
import SettingsButton from '../components/SettingsButton.vue'
import { useIdeas } from '../lib/queries'
import { displayHost } from '../lib/usePublications'
import QueryState from '../components/QueryState.vue'

/**
 * A publication's landing page: a short summary of each of its steps, with the quick action for each. It is not a
 * numbered step, so nothing in the menu is current here. Visiting spends nothing.
 */
const props = defineProps<{ publicationId: string }>()
const ideas = useIdeas(() => props.publicationId)
</script>

<template>
  <PublicationGate v-slot="{ publication }" :publication-id="publicationId">
    <div class="mb-2 flex items-center gap-4">
      <PublicationImage
        :id="publication.id"
        :name="publication.name"
        :image-url="publication.imageUrl"
        :site-icon-url="publication.siteIconUrl"
        size="sm"
      />
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <h1 class="h1 break-words">{{ publication.name }}</h1>
          <SettingsButton
            :to="{ name: 'publication-settings', params: { publicationId } }"
            label="Publication settings"
          />
        </div>
        <p v-if="publication.siteUrl" class="meta truncate">
          <a :href="publication.siteUrl" target="_blank" rel="noopener noreferrer" class="link">
            {{ displayHost(publication.siteUrl) }}
            <span class="sr-only">(opens in a new tab)</span>
          </a>
        </p>
      </div>
    </div>

    <PublicationAttention :publication-id="publicationId" />

    <PublicationDescription :publication="publication" />

    <RecentPostsSummary
      :publication-id="publicationId"
      :to="{ name: 'search', params: { publicationId } }"
    />

    <RecentReading
      :publication-id="publicationId"
      :idea-id="null"
      :to="{ name: 'read', params: { publicationId } }"
    />

    <RecentNotes
      :publication-id="publicationId"
      :idea-id="null"
      :to="{ name: 'publication-notes', params: { publicationId } }"
    />

    <LandingSection level="publication" step="ideas" title="Ideas">
      <template #actions>
        <RouterLink
          :to="{ name: 'publication-ideas', params: { publicationId } }"
          class="link text-sm"
        >
          See all ideas
        </RouterLink>
        <RouterLink :to="{ name: 'new-idea', params: { publicationId } }" class="btn btn-outline">
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
              :to="{ name: 'idea', params: { publicationId, id: idea.id } }"
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

    <NextStep
      v-if="!publication.description"
      :to="{ name: 'describe-publication', params: { publicationId } }"
      label="Describe this publication"
    >
      Say what it is for, who reads it and what goes here.
    </NextStep>
  </PublicationGate>
</template>
