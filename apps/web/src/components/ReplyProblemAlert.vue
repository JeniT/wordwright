<script setup lang="ts">
import { RouterLink } from 'vue-router'

/** What went wrong with a reply, and (when the fix is a key) where to add one. Shown wherever the conversation is. */
defineProps<{ message: string; needsKey: boolean }>()
</script>

<template>
  <div role="alert" class="mb-4 rounded-ctl border border-danger bg-danger-wash p-3 text-danger">
    <p>{{ message }}</p>
    <p v-if="needsKey" class="mt-1">
      <RouterLink to="/account/ai" class="underline">Go to account settings</RouterLink>
    </p>
  </div>
</template>
