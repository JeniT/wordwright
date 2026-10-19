<script setup lang="ts">
import { RouterLink } from 'vue-router'
import Icon from './Icon.vue'

/**
 * What went wrong with a reply, in a raspberry callout with an icon (never colour alone). A missing key and a
 * rejected one each say so and link to where the key is kept. Shown wherever the conversation is.
 */
defineProps<{ message: string; keyProblem: 'missing-key' | 'rejected-key' | null }>()
</script>

<template>
  <div role="alert" class="callout callout-danger mb-4 flex items-start gap-2">
    <Icon name="alert" class="mt-0.5 shrink-0" />
    <div>
      <p v-if="keyProblem === 'rejected-key'">
        Your AI provider didn’t accept your key. Check it in
        <RouterLink to="/account/ai" class="underline">your AI key settings</RouterLink>.
      </p>
      <template v-else>
        <p>{{ message }}</p>
        <p v-if="keyProblem === 'missing-key'" class="mt-1">
          <RouterLink to="/account/ai" class="underline">Add your AI key</RouterLink>
        </p>
      </template>
    </div>
  </div>
</template>
