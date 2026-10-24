<script setup lang="ts">
import NextStep from '../components/NextStep.vue'
import Explain from '../components/Explain.vue'
import IdeaNotes from '../components/IdeaNotes.vue'
import PublicationGate from '../components/PublicationGate.vue'
import StepHeading from '../components/StepHeading.vue'
import { useArticleList } from '../lib/articles'

/** Step 03 of a publication: its own notes, made while reading or jotted down, before they belong to an idea. */
const props = defineProps<{ publicationId: string }>()

// Each note says which item of the articles it was taken from.
const reading = useArticleList(() => ({ publicationId: props.publicationId, ideaId: null }))
</script>

<template>
  <PublicationGate :publication-id="publicationId">
    <StepHeading>Note</StepHeading>
    <Explain tutorial-only class="mb-6">
      These are notes that you’ve made. You can add tags to help group them, drag them into order,
      and move them to become notes on new or current ideas.
    </Explain>
    <IdeaNotes
      :publication-id="publicationId"
      :idea-id="null"
      :article-list="reading.articles.value ?? []"
      quiet-heading
    />
    <NextStep />
  </PublicationGate>
</template>
