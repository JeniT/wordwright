<script setup lang="ts">
import EmailNotice from './EmailNotice.vue'

/**
 * The notices at the top of a page, in the content column and not sticky. A **warn** notice needs something done
 * (confirm your email address) and comes first; an **info** notice is an offer. Info notices are held back on a
 * quiet page, the editor, so nothing interrupts writing. See "Notices" in docs/design.md.
 */
</script>

<template>
  <div class="mb-6 flex flex-col gap-3 empty:hidden">
    <EmailNotice />
  </div>
</template>
