<script setup lang="ts">
import { RouterLink } from 'vue-router'
import PublicationGate from '../components/PublicationGate.vue'
import StepHeading from '../components/StepHeading.vue'
import { useIdeas } from '../lib/queries'
import QueryState from '../components/QueryState.vue'

/** Step 03 of a publication: choose which idea to work on next. */
const props = defineProps<{ publicationId: string }>()
const ideas = useIdeas(() => props.publicationId)
</script>

<template>
  <PublicationGate :publication-id="publicationId">
    <StepHeading>Ideas</StepHeading>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <p class="max-w-prose text-ink-soft">Choose what to work on next.</p>
      <RouterLink :to="{ name: 'new-idea', params: { publicationId } }" class="btn btn-primary">
        New idea
      </RouterLink>
    </div>
    <QueryState :query="ideas" what="ideas">
      <p v-if="!ideas.data.value?.length" class="text-ink-soft">
        No ideas yet. When one occurs to you, note it down here, then draft it from there.
      </p>
      <ul v-else class="panel divide-y divide-line">
        <li v-for="idea in ideas.data.value" :key="idea.id">
          <RouterLink
            :to="{ name: 'idea', params: { publicationId, id: idea.id } }"
            class="flex items-baseline justify-between gap-3 px-4 py-3 no-underline hover:bg-sunken"
          >
            <span class="text-lg font-semibold">{{ idea.name }}</span>
            <span class="meta shrink-0">
              {{ idea.draftCount }} {{ idea.draftCount === 1 ? 'draft' : 'drafts' }}
            </span>
          </RouterLink>
        </li>
      </ul>
    </QueryState>
  </PublicationGate>
</template>
