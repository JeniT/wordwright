<script setup lang="ts">
import NewTabLink from '../components/NewTabLink.vue'
import { RouterLink } from 'vue-router'
import Explain from '../components/Explain.vue'
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
import QuickAdd from '../components/QuickAdd.vue'

/**
 * A publication's landing page: a short summary of each of its steps, with the quick action for each. It is not a
 * numbered step, so nothing in the menu is current here. Visiting spends nothing.
 */
const props = defineProps<{ publicationId: string }>()
const ideas = useIdeas(() => props.publicationId)
</script>

<template>
  <PublicationGate v-slot="{ publication }" :publication-id="publicationId">
    <div class="mb-3 flex items-center gap-4">
      <PublicationImage
        :id="publication.id"
        :name="publication.name"
        :image-url="publication.imageUrl"
        :site-icon-url="publication.siteIconUrl"
        :site-icon-square="publication.siteIconSquare"
        size="sm"
      />
      <div class="min-w-0 flex-1">
        <h1 class="h1 break-words">{{ publication.name }}</h1>
        <p v-if="publication.siteUrl" class="meta truncate">
          <NewTabLink :href="publication.siteUrl" class="link">{{
            displayHost(publication.siteUrl)
          }}</NewTabLink>
        </p>
      </div>
      <SettingsButton
        :to="{ name: 'publication-settings', params: { publicationId } }"
        label="Publication settings"
      />
    </div>
    <!-- On shared publications only: alone, you can only be the owner (as on Home). -->
    <p v-if="publication.members.length > 1" class="meta mb-4">
      <span class="chip chip-quiet mr-1">{{
        publication.role === 'owner' ? 'Owner' : 'Member'
      }}</span>
      Shared with {{ publication.members.length - 1 }}
      {{ publication.members.length === 2 ? 'person' : 'people' }}
    </p>

    <Explain tutorial-only class="mb-6">
      This is your publication’s home. See the latest from your feeds, then your reading, notes and
      ideas for what to write.
    </Explain>

    <NextStep
      v-if="!publication.description"
      top
      :to="{ name: 'publication-settings-description', params: { publicationId } }"
      label="Describe this publication"
    />

    <PublicationAttention :publication-id="publicationId" />

    <PublicationDescription :publication="publication" />

    <QuickAdd class="mt-6" in-place :publications="[publication]" />

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
      </template>
      <QueryState :query="ideas" what="ideas">
        <template v-if="!ideas.data.value?.length">
          <p class="text-ink-soft">No ideas yet.</p>
          <Explain tutorial-only>
            An idea is something you want to write about. It keeps its own notes, reading and
            drafts.
          </Explain>
        </template>
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
  </PublicationGate>
</template>
