<script setup lang="ts">
import { RouterLink } from 'vue-router'
import HelpPage from '../components/HelpPage.vue'
import Icon from '../components/Icon.vue'
</script>

<template>
  <HelpPage title="Drafting">
    <h2 class="mb-2 font-display text-xl font-semibold">Writing and saving</h2>
    <p class="mb-2">
      Your draft saves itself a couple of seconds after you stop typing, so there is no Save button.
      The line above the draft says whether it is saved.
    </p>
    <p class="mb-6">
      The buttons above the draft, the shortcuts and the Markdown box are on the
      <RouterLink to="/help/formatting" class="link">formatting page</RouterLink>.
    </p>

    <h2 class="mb-2 font-display text-xl font-semibold">The side panel</h2>
    <p class="mb-2">The panel beside the draft has up to four tabs:</p>
    <ul class="mb-2 list-disc space-y-1 pl-5">
      <li>Notes: the notes you have kept on this idea. Insert one at the cursor.</li>
      <li>Articles: the articles you have saved. Insert a link to one.</li>
      <li>Comments: your comments on the draft, and your AI’s when you ask for a critique.</li>
      <li>Reviews: who is reading this draft. Only its editor and the owners see this tab.</li>
    </ul>
    <p class="mb-2">How you open the panel depends on the width of your screen:</p>
    <ul class="mb-2 list-disc space-y-1 pl-5">
      <li>On a wide screen it is always beside the draft.</li>
      <li>On a tablet, press Open panel under the draft.</li>
      <li>
        On a phone, press the arrow
        <Icon name="left" :size="16" class="inline align-text-bottom" />
        at the right end of the top bar, named Draft panel.
      </li>
    </ul>
    <p class="mb-6">
      On a tablet or a phone the panel slides over the draft. Press Close panel, or Esc, to get back
      to your words.
    </p>

    <h2 class="mb-2 font-display text-xl font-semibold">Critique</h2>
    <p class="mb-2">
      A critique is your AI reading the draft and commenting on its weakest points, most important
      first. It points and asks; it never writes replacement words.
    </p>
    <ol class="mb-2 list-decimal space-y-1 pl-5">
      <li>Open the Comments tab.</li>
      <li>Press Critique, below your comments. Your draft is saved first.</li>
      <li>Read the comments that arrive, and change the draft in your own words.</li>
      <li>Resolve a comment when you have dealt with it, or decided not to.</li>
    </ol>
    <p class="mb-2">
      Critique sends your publication’s description and this draft’s title and text to your AI. It
      does not send your notes.
    </p>
    <p class="mb-6">
      Each draft gets a few critiques, and the count under the button reads, for example, “2 of 3
      critiques used”. Only the draft’s editor can ask for one. The reason for the limit, and how to
      change it, are on the
      <RouterLink :to="{ name: 'help-ai-settings' }" class="link">AI settings page</RouterLink>.
    </p>

    <h2 class="mb-2 font-display text-xl font-semibold">Hand over editing, or send for review</h2>
    <p class="mb-2">
      Both share your draft with someone else, for different reasons. Each draft has one editor, the
      only person who can change its words.
    </p>
    <ul class="mb-2 list-disc space-y-2 pl-5">
      <li>
        Hand over editing gives the draft to another member of the publication. Use it when someone
        else should carry on writing. They are emailed, and it stays yours until they accept.
      </li>
      <li>
        Send for review shows a snapshot of the draft to the people you choose. Use it when you want
        their comments and still want to be the writer. They can comment but not change anything.
      </li>
    </ul>
    <p class="mb-2">
      Hand over editing is above the draft. A member who is not the editor sees Ask for this draft
      there instead, which only prompts the editor.
    </p>
    <p class="mb-2">
      Send for review is at the top of the Reviews tab. A snapshot is a frozen copy of the title and
      text, so reviewers comment on words they actually saw. Edit the draft afterwards and their
      snapshot stays as it was.
    </p>
    <p class="mb-6">
      Each sending is a review request. The Reviews tab shows them one at a time, with how many of
      the reviews are complete. Closing a request’s reviews is final.
    </p>

    <h2 class="mb-2 font-display text-xl font-semibold">Publishing</h2>
    <p class="mb-2">
      Wordwright does not publish for you. At the bottom of the draft, Copy and Copy as Markdown put
      it on your clipboard to paste wherever you publish.
    </p>
    <p class="mb-6">
      Then switch on “I’ve published this draft”, and add a link to the post if you like. The draft
      stays in its idea’s list, marked as published, and stops appearing in Keep writing.
    </p>

    <h2 class="mb-2 font-display text-xl font-semibold">When you are not the editor</h2>
    <p>
      You can read the draft and comment on it, but only its editor can change it. The notice above
      the draft says who that is.
    </p>
  </HelpPage>
</template>
