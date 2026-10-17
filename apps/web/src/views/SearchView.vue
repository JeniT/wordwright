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
  <PublicationGate v-slot="{ publication }" :publication-id="publicationId">
    <StepHeading>Search</StepHeading>
    <p class="mb-4 text-ink-soft">
      Recent posts from {{ publication.name }}’s feeds. Add the ones worth reading to the reading
      list.
    </p>
    <p v-if="sources.isSuccess.value" class="mb-8">
      <FeedsLink
        :publication-id="publicationId"
        :has-feeds="(sources.data.value?.length ?? 0) > 0"
      />
    </p>
    <RecentPosts :publication-id="publicationId" />
    <NextStep :to="{ name: 'read', params: { publicationId } }" label="Next: 02 Read">
      Read what you’ve gathered on the reading list and take notes from it.
    </NextStep>
  </PublicationGate>
</template>
