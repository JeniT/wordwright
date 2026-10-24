<script setup lang="ts">
import NextStep from '../components/NextStep.vue'
import ExportSection from '../components/ExportSection.vue'
import PublicationGate from '../components/PublicationGate.vue'
import StepHeading from '../components/StepHeading.vue'

defineProps<{ publicationId: string }>()
</script>

<template>
  <PublicationGate v-slot="{ publication }" :publication-id="publicationId">
    <div class="max-w-xl">
      <StepHeading>Download</StepHeading>
      <ExportSection :publication="{ id: publication.id, role: publication.role }" />
      <NextStep />
    </div>
  </PublicationGate>
</template>
