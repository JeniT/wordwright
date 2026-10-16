<script setup lang="ts">
import { RouterLink } from 'vue-router'
import HelpPage from '../components/HelpPage.vue'
import ProviderPrivacyAdvice from '../components/ProviderPrivacyAdvice.vue'
</script>

<template>
  <HelpPage title="Privacy and your writing">
    <p class="mb-4 text-ink-soft">
      The AI buttons send the text you are working on to Anthropic, using your own key. These are
      the things worth checking before you start.
    </p>
    <ProviderPrivacyAdvice />
    <p class="text-sm">
      Don’t have a key yet? See
      <RouterLink to="/help/api-key" class="link">how to get one</RouterLink>.
    </p>
  </HelpPage>
</template>
