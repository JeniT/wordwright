<script setup lang="ts">
import NextStep from '../components/NextStep.vue'
import PublicationGate from '../components/PublicationGate.vue'
import FeedsLink from '../components/FeedsLink.vue'
import RecentPosts from '../components/RecentPosts.vue'
import StepHeading from '../components/StepHeading.vue'
import { useSources } from '../lib/queries'

/**
 * Step 01 of a publication: look for things worth writing about. Recent posts from the feeds, which can be added to
 * the reading list. The feeds themselves are set up in the publication's settings.
 */
const props = defineProps<{ publicationId: string }>()
const sources = useSources(() => props.publicationId)
</script>

<template>
  <PublicationGate :publication-id="publicationId">
    <div class="flex flex-wrap items-start justify-between gap-x-4">
      <StepHeading>Search</StepHeading>
      <FeedsLink
        v-if="sources.isSuccess.value"
        :publication-id="publicationId"
        :has-feeds="(sources.data.value?.length ?? 0) > 0"
      />
    </div>
    <RecentPosts :publication-id="publicationId" />
    <NextStep :to="{ name: 'read', params: { publicationId } }" label="Next: 02 Read" />
  </PublicationGate>
</template>
