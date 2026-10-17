<script setup lang="ts">
import Explain from '../components/Explain.vue'
import PublicationGate from '../components/PublicationGate.vue'
import PublicationSources from '../components/PublicationSources.vue'
import StepHeading from '../components/StepHeading.vue'

/** The feeds a publication looks through for recent posts. Any member can change them. */
defineProps<{ publicationId: string }>()
</script>

<template>
  <PublicationGate v-slot="{ publication }" :publication-id="publicationId">
    <div class="max-w-xl">
      <StepHeading>Feeds</StepHeading>
      <Explain tutorial-only class="mb-6">
        Wordwright looks through these for recent posts you might want to write about. You can then
        add them to your reading list.
      </Explain>
      <PublicationSources :key="publication.id" :publication-id="publication.id" />
    </div>
  </PublicationGate>
</template>
