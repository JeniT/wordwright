<script setup lang="ts">
import Explain from '../components/Explain.vue'
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
    <Explain tutorial-only class="mb-6">
      This is your reading list. Click through to take notes on these articles. You can also tag
      reading list items and move them to an idea’s reading list.
    </Explain>
    <ReadingList :publication-id="publicationId" :idea-id="null" />
    <NextStep
      :to="{ name: 'publication-notes', params: { publicationId } }"
      label="Next: 03 Note"
    />
  </PublicationGate>
</template>
