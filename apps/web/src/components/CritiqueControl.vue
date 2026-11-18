<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import AiButton from './AiButton.vue'
import Explain from './Explain.vue'

/**
 * The Critique button, how many of the draft's critiques are used, and what it sends. The drafting page puts it under
 * the draft until the first critique, then at the end of the Comments tab, after the comments, so the writer meets
 * them before asking again (see docs/ai-features.md). Only the draft's editor sees it.
 */
const props = defineProps<{
  /** Pressed, until the comments (or why not) arrive. */
  busy: boolean
  /** The critiques used and allowed for this draft, once known. */
  looks: { used: number; allowed: number } | null | undefined
}>()
const emit = defineEmits<{
  critique: []
  /** The "publish it" link was followed (a drawer closes so the Publish section is in view). */
  toPublish: []
}>()
const outOfLooks = computed(() => !!props.looks && props.looks.used >= props.looks.allowed)
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <AiButton
        class="btn btn-outline"
        :busy="busy"
        busy-text="Reading your draft…"
        :disabled="outOfLooks"
        :aria-describedby="looks ? 'critique-looks critique-sent' : 'critique-sent'"
        @click="emit('critique')"
      >
        Critique
      </AiButton>
      <p v-if="looks && !outOfLooks" id="critique-looks" class="meta">
        {{ looks.used }} of {{ looks.allowed }} critiques used
      </p>
      <Explain label="About Critique" class="-ml-2">
        If you ask for a critique, your AI will give you comments on how to improve your draft. AI
        will always find something wrong with your text, so you can only do this a limited number of
        times for a draft; you can change this limit in your user settings.
      </Explain>
    </div>
    <p v-if="looks && outOfLooks" id="critique-looks" class="mt-2 text-sm text-ink-soft">
      You have used your {{ looks.allowed }} {{ looks.allowed === 1 ? 'critique' : 'critiques' }} of
      this draft. The next step is to
      <RouterLink :to="{ hash: '#publish' }" class="underline" @click="emit('toPublish')"
        >publish it</RouterLink
      >. Change how many critiques a draft gets in your
      <RouterLink to="/account/ai" class="underline">account settings</RouterLink>.
    </p>
    <p id="critique-sent" class="mt-2 text-sm text-ink-soft">
      Critique will send this publication’s description and this draft’s title and text to your AI.
      It will not send your notes.
    </p>
  </div>
</template>
