<script setup lang="ts">
import NewTabLink from '../components/NewTabLink.vue'
import Explain from '../components/Explain.vue'
import NextStep from '../components/NextStep.vue'
import PublicationAttention from '../components/PublicationAttention.vue'
import PublicationDescription from '../components/PublicationDescription.vue'
import PublicationGate from '../components/PublicationGate.vue'
import PublicationIdeas from '../components/PublicationIdeas.vue'
import PublicationImage from '../components/PublicationImage.vue'
import RecentNotes from '../components/RecentNotes.vue'
import RecentPostsSummary from '../components/RecentPostsSummary.vue'
import RecentReading from '../components/RecentReading.vue'
import SettingsButton from '../components/SettingsButton.vue'
import { displayHost } from '../lib/usePublications'
import KeepWriting from '../components/KeepWriting.vue'
import QuickAdd from '../components/QuickAdd.vue'

/**
 * A publication's landing page: its ideas, then a short summary of each step for finding more (Scan, Read, Note), with the quick action for each. It is not a
 * numbered step, so nothing in the menu is current here. Visiting spends nothing.
 */
defineProps<{ publicationId: string }>()
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
      This is your publication’s home. Start with your ideas, or if you are stuck, see the latest
      from your feeds, then your reading and notes.
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

    <KeepWriting class="mt-6" :publication-id="publicationId" />

    <PublicationIdeas :publication-id="publicationId" />

    <section aria-labelledby="stuck-heading" class="mt-8 border-t border-line pt-6">
      <h2 id="stuck-heading" class="mb-4 font-display text-xl font-semibold">Stuck for ideas?</h2>
      <RecentPostsSummary
        nested
        explain="First look for recent articles or news stories for inspiration. Here, you can subscribe to feeds that may contain interesting pieces and add them to your articles."
        :publication-id="publicationId"
        :to="{ name: 'scan', params: { publicationId } }"
      />

      <RecentReading
        nested
        explain="Second, read the articles or news stories in this idea’s articles and take notes on them. These can also be moved to a new or existing idea’s articles."
        :publication-id="publicationId"
        :idea-id="null"
        :to="{ name: 'read', params: { publicationId } }"
      />

      <RecentNotes
        nested
        explain="Third, review, tag and arrange your notes. These can be moved to become notes on a new or existing idea as well."
        :publication-id="publicationId"
        :idea-id="null"
        :to="{ name: 'publication-notes', params: { publicationId } }"
      />
    </section>
  </PublicationGate>
</template>
