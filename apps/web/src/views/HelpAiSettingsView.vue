<script setup lang="ts">
import { RouterLink } from 'vue-router'
import HelpPage from '../components/HelpPage.vue'
import Icon from '../components/Icon.vue'
</script>

<template>
  <HelpPage title="Your AI settings">
    <h2 class="mb-1 font-display text-xl font-semibold">The AI mark</h2>
    <p class="mb-4">
      A button with this mark
      <Icon name="ai" :size="16" class="inline align-text-bottom" />
      sends your text to your AI and uses your key, so it costs tokens. While it works, the mark
      turns into a spinner. Until you have saved a key, these buttons are greyed out, with a link
      beside them to add one. Buttons without the mark never send anything. Before you start, read
      the
      <RouterLink to="/help/privacy" class="link">privacy advice</RouterLink>.
    </p>
    <h2 class="mb-1 font-display text-xl font-semibold">Why critiques are limited</h2>
    <p class="mb-4">
      An AI editor can always find more to change, and each round of changes can take a draft
      further from your voice and further from finished. So each draft gets a limited number of
      critiques. The count belongs to the draft, and editing it doesn’t reset it. When they are used
      up, the next step is to publish.
    </p>
    <p>
      The same number limits <strong>Rephrase</strong>: in one Rephrase window you can change your
      aim and ask for more options that many times. You can change the number under
      <RouterLink :to="{ name: 'account-ai' }" class="link">Critique limit</RouterLink>.
    </p>
    <h2 class="mt-4 mb-1 font-display text-xl font-semibold">Why your AI suggests notes</h2>
    <p>
      Your AI in Refine suggests the points you make as notes, in your words, above its reply.
      Nothing is added until you add it: tick a suggestion to add it, edit it first if it isn’t
      quite what you meant, or cross it to ignore it. An ignored suggestion can be brought back.
      Suggested pages, ideas and titles work the same way.
    </p>
    <h2 class="mt-4 mb-1 font-display text-xl font-semibold">
      Why an idea holds five conversations
    </h2>
    <p>
      Talking an idea over can go on for ever without moving it forward. So each idea holds up to
      five Refine conversations. Start another with New conversation, page between them, rename one
      with its pencil, and delete one to make room. Everyone who works in the publication sees them
      all.
    </p>
  </HelpPage>
</template>
