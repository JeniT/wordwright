<script setup lang="ts">
import NextStep from '../components/NextStep.vue'
import AppearanceSection from '../components/AppearanceSection.vue'
import StepHeading from '../components/StepHeading.vue'
</script>

<template>
  <div>
    <StepHeading>Display</StepHeading>
    <div class="space-y-10">
      <AppearanceSection />
    </div>
    <NextStep />
  </div>
</template>
