<script setup lang="ts">
import Explain from '../components/Explain.vue'
import IdeaGate from '../components/IdeaGate.vue'
import IdeaNotes from '../components/IdeaNotes.vue'
import NextStep from '../components/NextStep.vue'
import StepHeading from '../components/StepHeading.vue'

/** Step 02 of an idea: its notes, tagged, merged, split and put in order. */
defineProps<{ publicationId: string; id: string }>()
</script>

<template>
  <IdeaGate :id="id" v-slot="{ idea }" :publication-id="publicationId">
    <StepHeading>Note</StepHeading>
    <Explain tutorial-only class="mb-6">
      These are the notes for this idea. You can add tags to help group them, drag them into order,
      and move them to other ideas.
    </Explain>
    <IdeaNotes
      :publication-id="publicationId"
      :idea-id="id"
      :article-list="idea.articles"
      quiet-heading
    />
    <NextStep :to="{ name: 'brainstorm', params: { publicationId, id } }" label="Next: 04 Refine" />
  </IdeaGate>
</template>
