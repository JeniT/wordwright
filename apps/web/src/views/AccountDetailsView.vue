<script setup lang="ts">
import NextStep from '../components/NextStep.vue'
import NameSection from '../components/NameSection.vue'
import EmailSection from '../components/EmailSection.vue'
import UsernameSection from '../components/UsernameSection.vue'
import StepHeading from '../components/StepHeading.vue'
</script>

<template>
  <div>
    <StepHeading>Your details</StepHeading>
    <div class="space-y-10">
      <NameSection />
      <EmailSection />
      <UsernameSection />
    </div>
    <NextStep />
  </div>
</template>
