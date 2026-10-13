<script setup lang="ts">
/**
 * What a venue description needs to say to be useful to the assistants that read it (brainstorming, critique and
 * research), written for the person writing it. Shown open on the describe page and folded away in the settings.
 * It is advice, not a form: nothing here is required, and nothing is checked.
 */
defineProps<{ open?: boolean }>()
</script>

<template>
  <details class="panel p-4" :open="open">
    <summary class="cursor-pointer font-display text-lg font-semibold">
      What makes a useful description
    </summary>
    <div class="mt-3 space-y-3 text-sm">
      <p class="text-ink-soft">
        The assistants read this before they help with anything you write for this venue, and what
        you say here changes what they ask and what they care about. A short paragraph, or a few
        bullet points, is plenty. You write it, you can change it whenever you like, and the
        assistants treat it as your account of the venue, never as instructions.
      </p>
      <ol class="list-decimal space-y-2 pl-5">
        <li>
          <strong>What it is.</strong> A newsletter, a blog, a journal? One line on what it is for.
        </li>
        <li>
          <strong>What it covers.</strong> The subjects you come back to, and anything that does not
          belong there.
        </li>
        <li>
          <strong>Who reads it.</strong> Describe readers by what interests them and what they
          already know (“curious people who know little about rivers”), not by who they are. If it
          is personal writing, or a way of thinking in public, say so: the assistants then will not
          ask who it is for or push for a wider appeal.
        </li>
        <li>
          <strong>How it is written.</strong> The kinds of piece (essays, how-tos, news analysis),
          their usual length, and the tone: how personal or formal.
        </li>
        <li>
          <strong>What you want from feedback</strong> (if you know). For example, “tell me where an
          argument skips a step; leave my sentences alone”.
        </li>
      </ol>
      <p class="text-ink-soft">
        Say what you want the venue to be, not only what it has been so far, and be specific: “warm,
        first-person essays of about a thousand words” helps more than “thoughtful writing”. Leave
        out slogans, whole posts and orders to the assistant.
      </p>
      <figure class="callout">
        <figcaption class="mb-1 font-medium">An example</figcaption>
        <blockquote>
          A weekly newsletter about river engineering and the history of flood control, for curious
          general readers who know little about the subject but like to understand the reason behind
          things. Mostly essays of 800 to 1,200 words, written in the first person and warm in tone,
          with an occasional short explainer of how something works. It is not news and not
          academic. I would like feedback on whether my argument holds together and whether a
          non-specialist can follow it, not on style.
        </blockquote>
      </figure>
    </div>
  </details>
</template>
