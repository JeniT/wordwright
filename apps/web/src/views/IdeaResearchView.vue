<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import Explain from '../components/Explain.vue'
import NextStep from '../components/NextStep.vue'
import PageNav from '../components/PageNav.vue'
import StepHeading from '../components/StepHeading.vue'
import ResearchForm from '../components/ResearchForm.vue'
import ResearchRun from '../components/ResearchRun.vue'
import { api } from '../lib/api'
import { queryKeys, useIdea } from '../lib/queries'
import QueryState from '../components/QueryState.vue'
import IdeaGate from '../components/IdeaGate.vue'

/** Step 01 of an idea: ask your AI to research it, and see the research so far, one run at a time. */
const props = defineProps<{ publicationId: string; id: string }>()

const idea = useIdea(
  () => props.publicationId,
  () => props.id,
)
const runs = useQuery({
  queryKey: computed(() => queryKeys.research(props.publicationId, props.id)),
  queryFn: () => api.getResearch(props.publicationId, props.id),
})

// Oldest first, so a new run goes at the end and "Later research" leads to it. The newest is shown until the writer
// goes back (or a new one arrives, which `showNewest` jumps to).
const ordered = computed(() =>
  [...(runs.data.value ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
)
const chosen = ref<string | null>(null)
const position = computed(() => {
  const at = ordered.value.findIndex((r) => r.id === chosen.value)
  return at === -1 ? ordered.value.length - 1 : at
})
const current = computed(() => ordered.value[position.value])
const showNewest = () => (chosen.value = null)
const heading = ref<HTMLElement | null>(null)
function go(step: -1 | 1) {
  chosen.value = ordered.value[position.value + step]?.id ?? null
}
/** From the bottom of the run the next one starts a long way up, so go back to the top of it. */
function goFromBottom(step: -1 | 1) {
  go(step)
  heading.value?.scrollIntoView?.({ block: 'start' })
  heading.value?.focus({ preventScroll: true }) // keyboard users continue from the top too
}
const nav = computed(() => ({
  page: position.value + 1,
  pageCount: ordered.value.length,
  first: position.value + 1,
  last: position.value + 1,
  total: ordered.value.length,
  noun: 'research',
  size: 1,
  single: true,
  previousLabel: 'Earlier research',
  nextLabel: 'Later research',
}))
</script>

<template>
  <IdeaGate :id="id" :publication-id="publicationId">
    <article v-if="idea.data.value" class="max-w-2xl">
      <StepHeading>Research</StepHeading>
      <Explain tutorial-only class="-mt-3 mb-6">
        Describe the areas you want to look into and your AI will suggest pages worth reading,
        aiming for a range of opinions. Add the ones you want to your articles.
      </Explain>

      <ResearchForm class="mb-8" :publication-id="publicationId" :idea-id="id" @done="showNewest" />

      <section aria-labelledby="previous-heading">
        <h2
          id="previous-heading"
          ref="heading"
          tabindex="-1"
          class="mb-3 font-display text-xl font-semibold focus:outline-none"
        >
          Research so far
        </h2>
        <QueryState :query="runs" what="the research">
          <p v-if="!current" class="text-ink-soft">No research yet.</p>
          <template v-else>
            <PageNav
              v-if="ordered.length > 1"
              v-bind="nav"
              label="Research, above the list"
              announce
              class="mb-3"
              @go="go"
            />
            <ResearchRun
              :key="current.id"
              :publication-id="publicationId"
              :idea-id="id"
              :run="current"
            />
            <!-- Only worth repeating below a run long enough to need it. -->
            <PageNav
              v-if="ordered.length > 1 && current.items.length"
              v-bind="nav"
              label="Research, below the list"
              class="mt-3"
              @go="goFromBottom"
            />
          </template>
        </QueryState>
      </section>
      <NextStep :to="{ name: 'idea-read', params: { publicationId, id } }" label="Next: 02 Read" />
    </article>
  </IdeaGate>
</template>
