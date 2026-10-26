<script setup lang="ts">
import { RouterLink } from 'vue-router'
import HelpPage from '../components/HelpPage.vue'

/** The list of help pages. Add a page to the router and to this list; docs/agents/definition-of-done.md says when. */
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
    name: 'help-ai-settings',
    title: 'Your AI settings',
    about: 'What the AI mark means, and why critiques are limited.',
  },
  {
    name: 'help-description',
    title: 'Writing a description',
    about: 'What to say about your publication so your AI knows what you are writing for.',
  },
  {
    name: 'help-feeds',
    title: 'Finding feeds',
    about:
      'How to find the address of a site’s feed, so Wordwright can look for posts to inspire you.',
  },
  {
    name: 'help-formatting',
    title: 'Formatting your draft',
    about: 'The formatting buttons, their shortcuts, and editing the Markdown itself.',
  },
  {
    name: 'help-waiting',
    title: 'Waiting for approval',
    about: 'Why a new account waits, and what happens when it is approved.',
  },
  {
    name: 'help-privacy-notice',
    title: 'Privacy notice',
    about: 'What Wordwright keeps about you, who handles it, and your rights.',
  },
  {
    name: 'help-terms',
    title: 'Terms of use',
    about: 'The rules for using Wordwright, including your AI key and the alpha.',
  },
  {
    name: 'help-cookies',
    title: 'Cookies',
    about: 'The one cookie we set, and the settings kept on your device.',
  },
  {
    name: 'help-accessibility',
    title: 'Accessibility statement',
    about: 'How we check that Wordwright works for everyone, and how to report a barrier.',
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
