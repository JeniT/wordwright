<script setup lang="ts">
import PasswordSection from '../components/PasswordSection.vue'
import DevicesSection from '../components/DevicesSection.vue'
import InvitationBlocksSection from '../components/InvitationBlocksSection.vue'
import StepHeading from '../components/StepHeading.vue'
</script>

<template>
  <div>
    <StepHeading>Sign-in and security</StepHeading>
    <div class="space-y-10">
      <PasswordSection />
      <DevicesSection />
      <InvitationBlocksSection />
    </div>
  </div>
</template>
