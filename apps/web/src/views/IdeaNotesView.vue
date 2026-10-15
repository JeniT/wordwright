<script setup lang="ts">
import IdeaGate from '../components/IdeaGate.vue'
import IdeaNotes from '../components/IdeaNotes.vue'
import NextStep from '../components/NextStep.vue'
import StepHeading from '../components/StepHeading.vue'

/** Step 02 of an idea: its notes, tagged, merged, split and put in order. */
defineProps<{ publicationId: string; id: string }>()
</script>

<template>
  <IdeaGate :id="id" v-slot="{ idea }" :publication-id="publicationId">
    <StepHeading>Notes</StepHeading>
    <IdeaNotes
      :publication-id="publicationId"
      :idea-id="id"
      :reading-list="idea.links"
      quiet-heading
    />
    <NextStep :to="{ name: 'brainstorm', params: { publicationId, id } }" label="Next: 03 Refine">
      Happy with the notes? Talk the idea through with your AI, which asks questions and records the
      points you make.
    </NextStep>
  </IdeaGate>
</template>
