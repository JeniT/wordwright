<script setup lang="ts">
import { RouterLink } from 'vue-router'
import IdeaGate from '../components/IdeaGate.vue'
import NextStep from '../components/NextStep.vue'
import ReadingList from '../components/ReadingList.vue'
import StepHeading from '../components/StepHeading.vue'

/** Step 01 of an idea: gather what it builds on (the idea's own reading list; the publication's is separate). */
defineProps<{ publicationId: string; id: string }>()
</script>

<template>
  <IdeaGate :id="id" :publication-id="publicationId">
    <StepHeading>Research</StepHeading>
    <ReadingList :publication-id="publicationId" :idea-id="id" />

    <section aria-labelledby="find-heading" class="mb-10">
      <h2 id="find-heading" class="mb-1 font-display text-xl font-semibold">
        Find more with your AI
      </h2>
      <p class="mb-3 text-sm text-ink-soft">
        Describe what you want to look into and your AI will search the web for pages worth reading,
        from more than one point of view. You review what it finds and choose what goes on the
        reading list above. You can research as many areas as you like.
      </p>
      <RouterLink
        :to="{ name: 'research', params: { publicationId, id } }"
        class="btn btn-outline inline-block"
      >
        Start research
      </RouterLink>
    </section>

    <NextStep :to="{ name: 'idea-notes', params: { publicationId, id } }" label="Next: 02 Notes">
      Read your sources and take notes from them, then tidy the notes.
    </NextStep>
  </IdeaGate>
</template>
