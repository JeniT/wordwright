<script setup lang="ts">
import NewTabLink from './NewTabLink.vue'
/** `level` is the heading level: 3 under a settings section's h2, 2 on the privacy help page, which has an h1. */
withDefaults(defineProps<{ level?: 2 | 3 }>(), { level: 3 })
</script>

<template>
  <section class="callout mb-4 text-sm" aria-labelledby="provider-privacy-heading">
    <component :is="`h${level}`" id="provider-privacy-heading" class="mb-1 font-medium"
      >Protect what you write</component
    >
    <p class="mb-2">Your writing is sent to Anthropic using your key. A few things to check:</p>
    <ul class="list-disc space-y-1 pl-5">
      <li>
        <strong>Use an API key from the Console, not a Claude chat subscription.</strong> API use is
        under Anthropic's commercial terms, which say retained data is never used to train its
        models without your permission. See the
        <NewTabLink href="https://privacy.claude.com" class="underline">Privacy Center</NewTabLink>
        for the current wording.
      </li>
      <li>
        <strong>Know how long it is kept.</strong> By default Anthropic deletes API inputs and
        outputs within 30 days, and you can check or change your settings at
        <NewTabLink href="https://platform.claude.com/settings/privacy" class="underline"
          >platform.claude.com/settings/privacy</NewTabLink
        >. Shorter “zero data retention” arrangements exist but need an agreement with Anthropic.
      </li>
      <li>
        <strong>Make a key just for Wordwright</strong>, in its own Console workspace if you can,
        with a spending limit, so you can revoke it without disturbing anything else.
      </li>
      <li><strong>Revoke the key</strong> in the Console if you stop using the service.</li>
      <li>
        <strong>Don't put in anything you couldn't send a trusted contractor</strong>, such as other
        people's private details or material you are bound to keep confidential.
      </li>
    </ul>
    <p class="mt-2">
      With a different provider, look for the same things: whether API data is used for training,
      how long it is kept, and whether you can set a spending limit.
    </p>
  </section>
</template>
