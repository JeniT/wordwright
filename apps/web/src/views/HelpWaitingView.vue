<script setup lang="ts">
import HelpPage from '../components/HelpPage.vue'
</script>

<template>
  <HelpPage title="Waiting for approval">
    <p class="mb-4">
      Wordwright is a private alpha. Only people the owner has approved can use it, so a new account
      waits until someone has looked at it. This keeps the number of people small while the site is
      being tested.
    </p>
    <h2 class="mb-1 font-display text-xl font-semibold">What happens next</h2>
    <p class="mb-4">
      We email you at the address you signed up with, with a link to sign in. If you are not
      approved, we email you that too. You don’t need to keep this page open.
    </p>
    <h2 class="mb-1 font-display text-xl font-semibold">If someone invited you</h2>
    <p class="mb-4">
      Accepting an invitation from a person who is already approved, to share a publication or to
      review a draft, lets you in straight away.
    </p>
    <h2 class="mb-1 font-display text-xl font-semibold">What the owner can see</h2>
    <p>
      Your name, your email address, when you signed up and whether you are approved. Nothing you
      write, and no API keys. Each decision is written to a log with who made it.
    </p>
  </HelpPage>
</template>
