<script setup lang="ts">
import IdeaGate from '../components/IdeaGate.vue'
import NextStep from '../components/NextStep.vue'
import ArticleList from '../components/ArticleList.vue'
import StepHeading from '../components/StepHeading.vue'

/** Step 02 of an idea: its own articles, to read from and take notes while reading (the publication's is separate). */
defineProps<{ publicationId: string; id: string }>()
</script>

<template>
  <IdeaGate :id="id" :publication-id="publicationId">
    <StepHeading>Read</StepHeading>
    <ArticleList :publication-id="publicationId" :idea-id="id" />
    <NextStep />
  </IdeaGate>
</template>
