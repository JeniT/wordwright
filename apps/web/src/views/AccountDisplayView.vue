<script setup lang="ts">
import AppearanceSection from '../components/AppearanceSection.vue'
import TutorialSettingsSection from '../components/TutorialSettingsSection.vue'
import StepHeading from '../components/StepHeading.vue'
</script>

<template>
  <div>
    <StepHeading>Display</StepHeading>
    <div class="space-y-10">
      <AppearanceSection />
      <TutorialSettingsSection />
    </div>
  </div>
</template>
