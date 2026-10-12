<script setup lang="ts">
import type { Profile } from '@lfwa/core'
import { computed } from 'vue'

/**
 * Where a venue description came from, when the AI drafted it: the mark, what has happened to it since (not yet
 * accepted, accepted as it was, or edited), and the posts it was drawn from as evidence. The origin follows the words:
 * once an AI draft, always marked as one, however much it has been changed. Nothing for words a person wrote.
 */
const props = defineProps<{
  profile: Pick<
    Profile,
    | 'description'
    | 'descriptionOrigin'
    | 'descriptionConfirmed'
    | 'descriptionEdited'
    | 'descriptionSources'
  >
}>()

const shown = computed(
  () => !!props.profile.description && props.profile.descriptionOrigin === 'inferred',
)
const posts = computed(() => {
  const n = props.profile.descriptionSources.length
  return `${n} ${n === 1 ? 'post' : 'posts'}`
})
const history = computed(() =>
  !props.profile.descriptionConfirmed
    ? 'You have not accepted it yet, so the assistant does not see it.'
    : props.profile.descriptionEdited
      ? 'Then edited by you.'
      : 'Accepted by you as it was.',
)
</script>

<template>
  <div v-if="shown" class="text-sm text-ink-soft">
    <p>
      <span class="chip chip-ai">AI draft</span>
      Drafted by AI from {{ posts }}. {{ history }}
    </p>
    <details v-if="profile.descriptionSources.length" class="mt-1">
      <summary class="cursor-pointer">The posts it was drawn from</summary>
      <ul class="mt-1 list-disc pl-5">
        <li v-for="url in profile.descriptionSources" :key="url" class="break-all">
          <a :href="url" target="_blank" rel="noopener noreferrer" class="underline">
            {{ url }}<span class="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      </ul>
    </details>
  </div>
</template>
