<script setup lang="ts">
import { RouterLink } from 'vue-router'
import HelpPage from '../components/HelpPage.vue'

/** The list of help pages. Add a page to the router and to this list; AGENTS.md says when. */
const pages = [
  {
    name: 'help-api-key',
    title: 'How to get an API key',
    about: 'Connect your own Anthropic account so the AI buttons work.',
  },
  {
    name: 'help-privacy',
    title: 'Privacy and your writing',
    about: 'What is sent to Anthropic when you use the AI, and what to check.',
  },
  {
    name: 'help-tutorial-mode',
    title: 'About tutorial mode',
    about: 'The explanations written out on the page while you are getting to know the site.',
  },
]
</script>

<template>
  <HelpPage title="Help" hide-back>
    <ul class="space-y-3" aria-label="Help pages">
      <li v-for="page in pages" :key="page.name" class="card p-4">
        <h2 class="font-semibold">
          <RouterLink :to="{ name: page.name }" class="link">{{ page.title }}</RouterLink>
        </h2>
        <p class="mt-1 text-sm text-ink-soft">{{ page.about }}</p>
      </li>
    </ul>
  </HelpPage>
</template>
