<script setup lang="ts">
import Explain from '../components/Explain.vue'
import PublicationDescriptionSection from '../components/PublicationDescriptionSection.vue'
import PublicationGate from '../components/PublicationGate.vue'
import StepHeading from '../components/StepHeading.vue'

/** The publication's description: a box to write it in, and a link to advice on what it needs. Optional. */
defineProps<{ publicationId: string }>()
</script>

<template>
  <PublicationGate v-slot="{ publication }" :publication-id="publicationId">
    <div class="max-w-xl">
      <StepHeading>Description</StepHeading>
      <Explain tutorial-only class="mb-6">
        Your description is shown at the top of the publication and given to your AI, so it knows
        what you are writing for.
      </Explain>
      <PublicationDescriptionSection :key="publication.id" :publication="publication" />
    </div>
  </PublicationGate>
</template>
