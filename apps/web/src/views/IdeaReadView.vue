<script setup lang="ts">
import IdeaGate from '../components/IdeaGate.vue'
import NextStep from '../components/NextStep.vue'
import ReadingList from '../components/ReadingList.vue'
import StepHeading from '../components/StepHeading.vue'

/** Step 02 of an idea: its own reading list, to read from and take notes while reading (the publication's is separate). */
defineProps<{ publicationId: string; id: string }>()
</script>

<template>
  <IdeaGate :id="id" :publication-id="publicationId">
    <StepHeading>Read</StepHeading>
    <ReadingList :publication-id="publicationId" :idea-id="id" />
    <NextStep :to="{ name: 'idea-notes', params: { publicationId, id } }" label="Next: 03 Note" />
  </IdeaGate>
</template>
