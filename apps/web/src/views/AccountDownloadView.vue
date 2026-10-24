<script setup lang="ts">
import NextStep from '../components/NextStep.vue'
import ExportSection from '../components/ExportSection.vue'
import StepHeading from '../components/StepHeading.vue'
</script>

<template>
  <div>
    <StepHeading>Download your writing</StepHeading>
    <div class="space-y-10">
      <ExportSection />
    </div>
    <NextStep />
  </div>
</template>
