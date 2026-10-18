<script setup lang="ts">
import HelpPage from '../components/HelpPage.vue'
import NewTabLink from '../components/NewTabLink.vue'
</script>

<template>
  <HelpPage title="Finding feeds">
    <p class="mb-6 text-ink-soft">
      A feed is how a site shares its new posts so other tools can read them. Wordwright reads the
      feeds you add and shows you recent posts that might give you something to write about.
    </p>
    <!-- One action each (docs/style-guide.md). The badge is decoration: the list already says they come in order. -->
    <ol class="mb-8 space-y-4">
      <li class="flex gap-3">
        <span class="step-num" aria-hidden="true">01</span>
        <p class="min-w-0">
          Choose a blog, newsletter or news site you’d like ideas from. If you have none in mind,
          <NewTabLink href="https://www.feedspot.com/" class="link">Feedspot</NewTabLink> lists
          blogs and news sites by topic.
        </p>
      </li>
      <li class="flex gap-3">
        <span class="step-num" aria-hidden="true">02</span>
        <p class="min-w-0">Copy its address from your browser. The home page is fine.</p>
      </li>
      <li class="flex gap-3">
        <span class="step-num" aria-hidden="true">03</span>
        <p class="min-w-0">
          Paste it into “Add a feed” and press Add feed. Wordwright looks for the site’s feed
          itself.
        </p>
      </li>
      <li class="flex gap-3">
        <span class="step-num" aria-hidden="true">04</span>
        <p class="min-w-0">If the site has more than one feed, choose the ones you want.</p>
      </li>
    </ol>
    <h2 class="mb-2 font-display text-xl font-semibold">If it doesn’t work</h2>
    <p class="mb-2">
      Some sites have no feed, or share only a short summary of each post. If the site shows its own
      feed link, often under “Subscribe”, paste that address instead.
    </p>
    <p>Wordwright can’t read email newsletters or social media accounts.</p>
  </HelpPage>
</template>
