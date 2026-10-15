<script setup lang="ts">
import NextStep from '../components/NextStep.vue'
import PublicationGate from '../components/PublicationGate.vue'
import PublicationSources from '../components/PublicationSources.vue'
import RecentPosts from '../components/RecentPosts.vue'
import StepHeading from '../components/StepHeading.vue'

/**
 * Step 01 of a publication: look for things worth writing about. Recent posts from the feeds, which can be added to
 * the reading list, and the feeds themselves.
 */
defineProps<{ publicationId: string }>()
</script>

<template>
  <PublicationGate v-slot="{ publication }" :publication-id="publicationId">
    <StepHeading>Search</StepHeading>
    <p class="mb-8 text-ink-soft">
      Where ideas for {{ publication.name }} can come from. Choose the blogs, newsletters, news and
      journals you’d like to look through for things worth writing about, and add what looks good to
      the reading list.
    </p>
    <RecentPosts :publication-id="publicationId" />
    <PublicationSources :publication-id="publicationId" />
    <NextStep :to="{ name: 'read', params: { publicationId } }" label="Next: 02 Read">
      Read what you’ve gathered on the reading list and take notes from it.
    </NextStep>
  </PublicationGate>
</template>
