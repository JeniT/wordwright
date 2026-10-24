<script setup lang="ts">
import Explain from '../components/Explain.vue'
import NextStep from '../components/NextStep.vue'
import PublicationGate from '../components/PublicationGate.vue'
import FeedsLink from '../components/FeedsLink.vue'
import RecentPosts from '../components/RecentPosts.vue'
import StepHeading from '../components/StepHeading.vue'
import { RECENT_POSTS_ABOUT } from '../lib/recent-posts'
import { useSources } from '../lib/queries'

/**
 * Step 01 of a publication: look for things worth writing about. Recent posts from the feeds, which can be added to
 * the articles. The feeds themselves are set up in the publication's settings.
 */
const props = defineProps<{ publicationId: string }>()
const sources = useSources(() => props.publicationId)
</script>

<template>
  <PublicationGate :publication-id="publicationId">
    <div class="flex flex-wrap items-start justify-between gap-x-4">
      <StepHeading>Scan</StepHeading>
      <FeedsLink
        v-if="sources.isSuccess.value"
        :publication-id="publicationId"
        :has-feeds="(sources.data.value?.length ?? 0) > 0"
      />
    </div>
    <Explain tutorial-only class="-mt-3 mb-6">{{ RECENT_POSTS_ABOUT }}</Explain>
    <RecentPosts :publication-id="publicationId" />
    <NextStep />
  </PublicationGate>
</template>
