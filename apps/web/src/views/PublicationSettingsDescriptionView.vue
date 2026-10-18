<script setup lang="ts">
import PublicationDescriptionSection from '../components/PublicationDescriptionSection.vue'
import PublicationGate from '../components/PublicationGate.vue'
import StepHeading from '../components/StepHeading.vue'

/** The publication's description: a box to write it in, with a link to advice on what it needs. Optional. */
defineProps<{ publicationId: string }>()
</script>

<template>
  <PublicationGate v-slot="{ publication }" :publication-id="publicationId">
    <div class="max-w-xl">
      <StepHeading>Description</StepHeading>
      <PublicationDescriptionSection :key="publication.id" :publication="publication" />
    </div>
  </PublicationGate>
</template>
