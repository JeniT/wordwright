<script setup lang="ts">
import { RouterLink } from 'vue-router'
import HelpPage from '../components/HelpPage.vue'
</script>

<template>
  <HelpPage title="Account settings">
    <h2 class="mb-2 font-display text-xl font-semibold">The account pages</h2>
    <p class="mb-2">Your account has six pages:</p>
    <ul class="mb-6 list-disc space-y-1 pl-5">
      <li>Your details: your name, email address and username.</li>
      <li>
        Your AI: the key that connects your AI, and the limit on critiques. See
        <RouterLink :to="{ name: 'help-ai-settings' }" class="link">your AI settings</RouterLink>.
      </li>
      <li>Display: light, dark, or whatever your device uses. It applies on this device only.</li>
      <li>
        Sign-in and security: your password, the devices you are signed in on, and who may invite
        you.
      </li>
      <li>Download your writing.</li>
      <li>Delete account.</li>
    </ul>

    <h2 class="mb-2 font-display text-xl font-semibold">Changing your details</h2>
    <p class="mb-2">
      Your name is what other members of a publication see, and a change shows everywhere at once.
      Changing your email address asks for your password, and we write to your old address as well
      as the new one. If you did not make the change, the message to the old address has a link to
      undo it.
    </p>
    <p class="mb-6">
      Your username is the short address people use to find you. You can change it a few times a
      day, but the addresses of publications you already made stay as they were.
    </p>

    <h2 class="mb-2 font-display text-xl font-semibold">Sign-in and security</h2>
    <p class="mb-6">
      If you signed in with Google, add a password here before you change your email address or
      delete your account. The Devices list shows where you are signed in. Sign out of one, or of
      every device but this one. Under Invitations you can block all invitations, or only certain
      people.
    </p>

    <h2 class="mb-2 font-display text-xl font-semibold">Downloading your writing</h2>
    <p class="mb-2">
      Download your writing gives you a zip of Markdown files, with a README that lists what is
      inside, a file for each idea and a file for each draft. You can open them in any text editor
      and paste them anywhere you publish.
    </p>
    <ul class="mb-2 list-disc space-y-1 pl-5">
      <li>Included: your ideas, notes, lists of articles and drafts.</li>
      <li>Not included: comments, reviews, brainstorming, and your AI key.</li>
      <li>Owners get every draft in a publication. Members get the drafts they edit or started.</li>
    </ul>
    <p class="mb-6">
      Each publication’s settings has a download of its own, with just that publication.
    </p>

    <h2 class="mb-2 font-display text-xl font-semibold">Deleting your account</h2>
    <p class="mb-2">
      Delete account is immediate and can’t be undone. Download your writing first. You need your
      password to confirm, and the dialog lists what goes before you press the button.
    </p>
    <p class="mb-2">What is removed:</p>
    <ul class="mb-2 list-disc space-y-1 pl-5">
      <li>every publication only you belong to, with its ideas, notes and drafts</li>
      <li>your account details, including your saved AI key</li>
    </ul>
    <p class="mb-2">What stays:</p>
    <ul class="mb-2 list-disc space-y-1 pl-5">
      <li>
        What you wrote in a publication that carries on without you. You are removed from it, and
        its drafts you were editing pass to an owner.
      </li>
      <li>
        Your name on your notes and comments there, if you choose to keep it. If you don’t, they
        show as “a former member”.
      </li>
    </ul>
    <p class="mb-6">
      If you are the only owner of a publication that others belong to, you can’t delete your
      account until you make someone else an owner. How long we keep anything is in the
      <RouterLink :to="{ name: 'help-privacy-notice' }" class="link">privacy notice</RouterLink>,
      and the rules for using Wordwright are in the
      <RouterLink :to="{ name: 'help-terms' }" class="link">terms of use</RouterLink>.
    </p>
  </HelpPage>
</template>
