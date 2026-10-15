<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import StepHeading from '../components/StepHeading.vue'
import ResearchForm from '../components/ResearchForm.vue'
import ResearchRun from '../components/ResearchRun.vue'
import { api } from '../lib/api'
import { queryKeys, useIdea } from '../lib/queries'
import QueryState from '../components/QueryState.vue'
import IdeaGate from '../components/IdeaGate.vue'

const props = defineProps<{ publicationId: string; id: string }>()

const idea = useIdea(
  () => props.publicationId,
  () => props.id,
)
const runs = useQuery({
  queryKey: computed(() => queryKeys.research(props.publicationId, props.id)),
  queryFn: () => api.getResearch(props.publicationId, props.id),
})
</script>

<template>
  <IdeaGate :id="id" :publication-id="publicationId">
    <article v-if="idea.data.value" class="max-w-2xl">
      <StepHeading>Research</StepHeading>
      <p class="mb-4 text-sm">
        <RouterLink :to="{ name: 'idea-research', params: { publicationId, id } }" class="link">
          ← Back to the reading list
        </RouterLink>
      </p>
      <p class="mb-6 text-sm text-ink-soft">
        Describe the areas you want to look into and your AI will search the web for pages worth
        reading, including some that may not agree with you. It only suggests: you review what it
        finds, and nothing joins the reading list until you add it. The idea's title and notes, the
        addresses already on its reading list and what you write here are sent to your AI provider,
        which does the searching; the text of your drafts never is. Everyone in this publication
        sees the research.
      </p>

      <ResearchForm class="mb-8" :publication-id="publicationId" :idea-id="id" />

      <section aria-labelledby="previous-heading">
        <h2 id="previous-heading" class="mb-3 font-display text-xl font-semibold">
          Research so far
        </h2>
        <QueryState :query="runs" what="the research">
          <p v-if="!runs.data.value?.length" class="text-ink-soft">
            Nothing yet. What you research will be kept here.
          </p>
          <ul v-else class="space-y-5">
            <li v-for="run in runs.data.value" :key="run.id">
              <ResearchRun :publication-id="publicationId" :idea-id="id" :run="run" />
            </li>
          </ul>
        </QueryState>
      </section>
    </article>
  </IdeaGate>
</template>
