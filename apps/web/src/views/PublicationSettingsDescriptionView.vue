<script setup lang="ts">
import PublicationDescriptionSection from '../components/PublicationDescriptionSection.vue'
import PublicationGate from '../components/PublicationGate.vue'
import StepHeading from '../components/StepHeading.vue'

/** Until the describe page moves in here (#241), this holds the same form the old settings page had. */
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
