<script setup lang="ts">
import NewTabLink from '../components/NewTabLink.vue'
import HelpPage from '../components/HelpPage.vue'
</script>

<template>
  <HelpPage title="Accessibility statement">
    <div class="space-y-4">
      <p class="text-ink-soft">
        We want Wordwright to work for everyone who writes, whether they use a mouse, a keyboard, a
        screen reader, a phone or a magnified screen. We aim to meet the Web Content Accessibility
        Guidelines (WCAG) 2.2, level AA.
      </p>
      <section aria-labelledby="a11y-checked">
        <h2 id="a11y-checked" class="font-semibold">What we check</h2>
        <ul class="mt-1 list-disc space-y-1 pl-5">
          <li>
            Every page is tested automatically with axe, in the light and dark themes, at phone
            width (390 pixels) and at 320 pixels, which is what a page looks like at 400% zoom.
            Those pages must not scroll sideways.
          </li>
          <li>Pages can be used with the keyboard alone, and show where the focus is.</li>
          <li>Lists you can reorder by dragging also have buttons that move an item up or down.</li>
          <li>Animation is reduced when your device asks for that.</li>
        </ul>
      </section>
      <section aria-labelledby="a11y-limits">
        <h2 id="a11y-limits" class="font-semibold">What we haven’t finished checking</h2>
        <p class="mt-1">
          Automated checks find only some problems. Testing by hand with screen readers (VoiceOver
          and NVDA) is not yet complete, so there may be barriers that we haven’t found.
        </p>
      </section>
      <section aria-labelledby="a11y-tell">
        <h2 id="a11y-tell" class="font-semibold">Tell us about a barrier</h2>
        <p class="mt-1">
          If something doesn’t work for you, please
          <NewTabLink href="https://github.com/JeniT/wordwright/issues/new" class="link"
            >report it on GitHub</NewTabLink
          >, saying the page, what you were trying to do, and any assistive technology you use. We
          treat accessibility problems as bugs.
        </p>
      </section>
      <p class="text-sm text-ink-soft">Last reviewed: 25 October 2026.</p>
    </div>
  </HelpPage>
</template>
