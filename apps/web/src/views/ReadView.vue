<script setup lang="ts">
import NextStep from '../components/NextStep.vue'
import PublicationGate from '../components/PublicationGate.vue'
import ReadingList from '../components/ReadingList.vue'
import StepHeading from '../components/StepHeading.vue'

/** Step 02 of a publication: the reading list, to read from and take notes while reading. */
defineProps<{ publicationId: string }>()
</script>

<template>
  <PublicationGate :publication-id="publicationId">
    <StepHeading>Read</StepHeading>
    <ReadingList :publication-id="publicationId" :idea-id="null" />
    <NextStep :to="{ name: 'publication-notes', params: { publicationId } }" label="Next: 03 Notes">
      Notes you take from your reading are kept together, ready to group into ideas.
    </NextStep>
  </PublicationGate>
</template>
