<script setup lang="ts">
import { RouterLink } from 'vue-router'
import HelpPage from '../components/HelpPage.vue'
</script>

<template>
  <HelpPage title="Cookies">
    <div class="space-y-6">
      <p>
        Wordwright uses one cookie, which keeps you signed in. We set no other cookies, so there is
        nothing to accept or decline. It’s the same whether or not you sign in with Google, and we
        have no advertising or tracking.
      </p>

      <section aria-labelledby="c-cookie">
        <h2 id="c-cookie" class="mb-1 font-display text-xl font-semibold">The cookie</h2>
        <dl class="space-y-1">
          <div>
            <dt class="inline font-semibold">wordwright_session</dt>
            <dd class="inline">
              keeps you signed in on this device. It is set when you sign in and removed when you
              sign out or after 30 days. Scripts on the page can’t read it. It is strictly
              necessary, so the law lets us set it without asking you.
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="c-store">
        <h2 id="c-store" class="mb-1 font-display text-xl font-semibold">
          Settings on your device
        </h2>
        <p>
          Your browser also keeps three choices you make, so that they are there next time. They
          stay on your device and are never sent to us:
        </p>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li>whether you chose the light, dark or your device’s theme;</li>
          <li>whether you switched on editing a draft as Markdown;</li>
          <li>the last publication you opened.</li>
        </ul>
        <p class="mt-2">Clearing your browser’s site data removes them, and the cookie too.</p>
      </section>

      <p>
        Other websites we link to, including Google when you sign in with it, have their own rules.
        More about what we keep is in the
        <RouterLink :to="{ name: 'help-privacy-notice' }" class="link">privacy notice</RouterLink>.
      </p>
      <p class="text-sm text-ink-soft">Last updated: 26 October 2026.</p>
    </div>
  </HelpPage>
</template>
