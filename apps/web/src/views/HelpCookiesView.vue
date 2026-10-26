<script setup lang="ts">
import { RouterLink } from 'vue-router'
import HelpPage from '../components/HelpPage.vue'
</script>

<template>
  <HelpPage title="Cookies">
    <div class="space-y-6">
      <p>
        Wordwright sets one cookie, which keeps you signed in. It sets no others, so there is
        nothing to accept or decline. We have no advertising or tracking.
      </p>

      <section aria-labelledby="c-cookie">
        <h2 id="c-cookie" class="mb-1 font-display text-xl font-semibold">The cookie</h2>
        <p>
          The cookie is called wordwright_session. It is set when you sign in, and removed when you
          sign out or after 30 days. Scripts on the page can’t read it.
        </p>
        <p class="mt-2">
          The law calls it strictly necessary, so we may set it without asking you.
        </p>
      </section>

      <section aria-labelledby="c-store">
        <h2 id="c-store" class="mb-1 font-display text-xl font-semibold">
          Settings on your device
        </h2>
        <p>
          Your browser also keeps three choices you make, so they are there next time. They stay on
          your device and are never sent to us:
        </p>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li>whether you chose the light theme, the dark theme or your device’s;</li>
          <li>whether you switched on editing a draft as Markdown;</li>
          <li>the last publication you opened.</li>
        </ul>
        <p class="mt-2">Clearing your browser’s site data removes them, and the cookie too.</p>
      </section>

      <p>
        Sites we link to, including Google when you sign in with it, have their own rules. See the
        <RouterLink :to="{ name: 'help-privacy-notice' }" class="link">privacy notice</RouterLink>
        for what we keep.
      </p>
      <p class="text-sm text-ink-soft">Last updated: 26 October 2026.</p>
    </div>
  </HelpPage>
</template>
