<script setup lang="ts">
import { RouterLink } from 'vue-router'
import DraftMarkdown from '../components/DraftMarkdown.vue'
import IdeaGate from '../components/IdeaGate.vue'
import StepHeading from '../components/StepHeading.vue'

/**
 * Step 05 of an idea: get a finished draft out. For now that is copying its Markdown to paste where you publish.
 * Later this is where publishing straight to a newsletter, and help drafting social threads, would sit.
 */
defineProps<{ profileId: string; id: string }>()
</script>

<template>
  <IdeaGate :id="id" v-slot="{ idea }" :profile-id="profileId">
    <StepHeading>Publish</StepHeading>
    <p class="mb-6 max-w-prose text-ink-soft">
      Copy a draft as Markdown and paste it where you publish. The words are yours; nothing is
      added.
    </p>
    <p v-if="!idea.drafts.length" class="text-ink-soft">
      There is nothing to publish yet.
      <RouterLink :to="{ name: 'idea-drafts', params: { profileId, id } }" class="link">
        Start a draft.
      </RouterLink>
    </p>
    <ul v-else class="panel divide-y divide-line">
      <DraftMarkdown
        v-for="draft in idea.drafts"
        :key="draft.id"
        :profile-id="profileId"
        :draft-id="draft.id"
      />
    </ul>
    <p class="meta mt-12 border-t border-line pt-6">
      Published? Your idea stays here, with its notes, sources and drafts.
    </p>
  </IdeaGate>
</template>
