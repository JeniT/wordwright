<script setup lang="ts">
import { RouterLink } from 'vue-router'
import HelpPage from '../components/HelpPage.vue'
</script>

<template>
  <HelpPage title="About tutorial mode">
    <p class="mb-4">
      Tutorial mode is for when you are new to Wordwright. It writes out, on the page, the short
      explanations that are otherwise tucked behind an
      <span class="whitespace-nowrap">info icon</span>, and says what each page is for. It never
      holds anything you need to avoid a mistake: that is always on the page, whether it is on or
      not.
    </p>
    <h2 class="mb-1 font-display text-xl font-semibold">Turning it on or off</h2>
    <p class="mb-4">
      It is on when you create an account. Once you have seen every kind of page that has a
      tutorial, we ask once whether you would like to turn it off. You can change it at any time
      with the <strong>Tutorial mode</strong> switch in
      <RouterLink :to="{ name: 'account-display' }" class="link">your account settings</RouterLink>,
      and turning it back on doesn’t make us forget which pages you have seen.
    </p>
    <h2 class="mb-1 font-display text-xl font-semibold">What we keep</h2>
    <p>
      Just the switch, the names of the kinds of page you have seen, and whether you answered the
      offer to turn it off. They are kept with your account and removed with it.
    </p>
  </HelpPage>
</template>
