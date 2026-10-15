<script setup lang="ts">
import { RouterLink } from 'vue-router'
import IdeaNotes from '../components/IdeaNotes.vue'
import NextStep from '../components/NextStep.vue'
import PublicationGate from '../components/PublicationGate.vue'
import StepHeading from '../components/StepHeading.vue'
import { useReadingList } from '../lib/reading'

/** Step 02 of a publication: its own notes, made while reading or jotted down, before they belong to an idea. */
const props = defineProps<{ publicationId: string }>()

// Each note says which item of the reading list it was taken from.
const reading = useReadingList(() => ({ publicationId: props.publicationId, ideaId: null }))
</script>

<template>
  <PublicationGate :publication-id="publicationId">
    <StepHeading>Notes</StepHeading>
    <IdeaNotes
      :publication-id="publicationId"
      :idea-id="null"
      :reading-list="reading.links.value ?? []"
      quiet-heading
    />
    <p class="text-sm text-ink-soft">
      Take notes from something you are reading on the
      <RouterLink :to="{ name: 'read', params: { publicationId } }" class="link">
        publication’s reading list</RouterLink
      >.
    </p>
    <NextStep :to="{ name: 'publication-ideas', params: { publicationId } }" label="Next: 04 Ideas">
      When a group of notes feels like something you’d write about, start an idea.
    </NextStep>
  </PublicationGate>
</template>
