<script setup lang="ts">
import { RouterLink } from 'vue-router'
import HelpPage from '../components/HelpPage.vue'
</script>

<template>
  <HelpPage title="No such help page" hide-back>
    <p class="mb-4">That page doesn’t exist, or has moved.</p>
    <RouterLink :to="{ name: 'help' }" class="link">All help</RouterLink>
  </HelpPage>
</template>
