<script setup lang="ts">
import { RouterLink } from 'vue-router'
import HelpPage from '../components/HelpPage.vue'
</script>

<template>
  <HelpPage title="How to get an API key">
    <p class="mb-6 text-ink-soft">
      Wordwright uses your own Anthropic account, so the cost of the AI is billed to you. This takes
      a few minutes and you only do it once.
    </p>
    <!-- One action each (docs/style-guide.md). The badge is decoration: the list already says they come in order. -->
    <ol class="mb-8 space-y-4">
      <li class="flex gap-3">
        <span class="step-num" aria-hidden="true">01</span>
        <p class="min-w-0">
          Sign in to the
          <a href="https://console.anthropic.com/" target="_blank" rel="noopener" class="link"
            >Anthropic Console<span class="sr-only"> (opens in a new tab)</span></a
          >. A Claude chat account won’t work here, so you may need to sign up.
        </p>
      </li>
      <li class="flex gap-3">
        <span class="step-num" aria-hidden="true">02</span>
        <p class="min-w-0">
          Add a payment method and a few dollars of credit in the Console’s billing settings. You
          can set a monthly spending limit there too.
        </p>
      </li>
      <li class="flex gap-3">
        <span class="step-num" aria-hidden="true">03</span>
        <p class="min-w-0">
          Open
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener"
            class="link"
            >API keys<span class="sr-only"> (opens in a new tab)</span></a
          >
          and choose “Create key”. Give it a name you’ll recognise, like “Wordwright”.
        </p>
      </li>
      <li class="flex gap-3">
        <span class="step-num" aria-hidden="true">04</span>
        <p class="min-w-0">Copy the key now. The Console shows it only once.</p>
      </li>
      <li class="flex gap-3">
        <span class="step-num" aria-hidden="true">05</span>
        <p class="min-w-0">
          Paste it into the key field in Wordwright and press Save. We check that it works before
          keeping it.
        </p>
      </li>
    </ol>
    <p class="text-sm text-ink-soft">
      Your key is stored encrypted, used only for your requests, and never shown again. You can
      replace or remove it from your account page. Before you start, read the
      <RouterLink to="/help/privacy" class="link">privacy advice</RouterLink>.
    </p>
  </HelpPage>
</template>
