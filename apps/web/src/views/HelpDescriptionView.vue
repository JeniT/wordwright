<script setup lang="ts">
import HelpPage from '../components/HelpPage.vue'
</script>

<template>
  <HelpPage title="Writing a description">
    <p class="mb-4">
      Your AI reads the description before it helps with anything you write for the publication, so
      what you say here changes what it asks and what it cares about. A short paragraph or a few
      bullet points is plenty.
    </p>
    <p class="mb-2">Say:</p>
    <ul class="mb-4 list-disc space-y-2 pl-5">
      <li>What it is: a newsletter, a blog, a journal? One line on what it is for.</li>
      <li>What it covers: the subjects you come back to, and anything that doesn’t belong.</li>
      <li>
        Who reads it, by what interests them and what they already know (“curious people who know
        little about rivers”), not by who they are. If the writing is personal, say so.
      </li>
      <li>
        How it is written: the kinds of piece, their usual length, and how personal or formal the
        tone is.
      </li>
      <li>
        What you want from feedback, if you know. For example, “tell me where an argument skips a
        step; leave my sentences alone”.
      </li>
    </ul>
    <p class="mb-6">
      Say what you want the publication to be, not only what it has been so far, and be specific:
      “warm, first-person essays of about a thousand words” helps more than “thoughtful writing”.
      Leave out slogans, whole posts and orders to your AI. Your AI treats the description as your
      account of the publication, never as instructions.
    </p>
    <h2 class="mb-2 font-display text-xl font-semibold">An example</h2>
    <blockquote class="callout">
      A weekly newsletter about river engineering and the history of flood control, for curious
      general readers who know little about the subject but like to understand the reason behind
      things. Mostly essays of 800 to 1,200 words, written in the first person and warm in tone,
      with an occasional short explainer of how something works. It is not news and not academic. I
      would like feedback on whether my argument holds together and whether a non-specialist can
      follow it, not on style.
    </blockquote>
  </HelpPage>
</template>
