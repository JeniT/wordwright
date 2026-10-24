<script setup lang="ts">
import NextStep from '../components/NextStep.vue'
import LlmSettingsSection from '../components/LlmSettingsSection.vue'
import CritiqueSettingsSection from '../components/CritiqueSettingsSection.vue'
import StepHeading from '../components/StepHeading.vue'
</script>

<template>
  <div>
    <StepHeading>Your AI</StepHeading>
    <div class="space-y-10">
      <LlmSettingsSection />
      <CritiqueSettingsSection />
    </div>
    <NextStep />
  </div>
</template>
