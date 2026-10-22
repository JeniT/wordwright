<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { KeyProblem } from '../lib/key-problem'
import Icon from './Icon.vue'

/**
 * What went wrong with a request to the person's AI, in a raspberry callout with an icon (never colour alone). A
 * missing key and a rejected one each say so and have one link to where the key is kept, so every place that
 * calls the AI shows them the same way. Any other problem is just its message.
 */
defineProps<{ message: string; keyProblem: KeyProblem | null }>()
</script>

<template>
  <div role="alert" class="callout callout-danger flex items-start gap-2">
    <Icon name="alert" class="mt-0.5 shrink-0" />
    <div>
      <p v-if="keyProblem === 'rejected-key'">
        Your AI provider didn’t accept your key. Check it in
        <RouterLink to="/account/ai" class="underline">your AI key settings</RouterLink>.
      </p>
      <p v-else-if="keyProblem === 'missing-key'">
        Your AI needs your key first.
        <RouterLink to="/account/ai" class="underline">Add your AI key</RouterLink>
      </p>
      <p v-else>{{ message }}</p>
    </div>
  </div>
</template>
