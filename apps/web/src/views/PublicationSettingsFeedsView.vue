<script setup lang="ts">
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
      <PublicationSources :key="publication.id" :publication-id="publication.id" />
    </div>
  </PublicationGate>
</template>
