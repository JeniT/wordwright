<script setup lang="ts">
import { RouterLink } from 'vue-router'

/** The legal and policy pages (#321), listed in the footer of every page. */
const links = [
  { name: 'help-privacy-notice', label: 'Privacy notice' },
  { name: 'help-terms', label: 'Terms of use' },
  { name: 'help-cookies', label: 'Cookies' },
  { name: 'help-accessibility', label: 'Accessibility' },
]
</script>

<template>
  <ul class="flex flex-wrap gap-x-4 gap-y-1">
    <li v-for="link in links" :key="link.name">
      <RouterLink :to="{ name: link.name }" class="link">{{ link.label }}</RouterLink>
    </li>
  </ul>
</template>
