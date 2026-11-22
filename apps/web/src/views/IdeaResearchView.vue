<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ResearchRun as Run } from '@wordwright/core'
import { useRoute } from 'vue-router'
import Explain from '../components/Explain.vue'
import NextStep from '../components/NextStep.vue'
import PageNav from '../components/PageNav.vue'
import StepHeading from '../components/StepHeading.vue'
import ResearchForm from '../components/ResearchForm.vue'
import ResearchRun from '../components/ResearchRun.vue'
import { useIdea, useResearch } from '../lib/queries'
import QueryState from '../components/QueryState.vue'
import IdeaGate from '../components/IdeaGate.vue'

/**
 * Step 01 of an idea: ask your AI to research it, and see the research so far, one run at a time. Every run is in the
 * pager whatever its state (#447): one still waiting or searching shows where it is, and fills in when it finishes.
 */
const props = defineProps<{ publicationId: string; id: string }>()

const idea = useIdea(
  () => props.publicationId,
  () => props.id,
)
const runs = useResearch(
  () => props.publicationId,
  () => props.id,
)

// Oldest first, so a new run goes at the end and "Later research" leads to it.
const ordered = computed(() =>
  [...(runs.data.value ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
)
const route = useRoute()
// A link from the idea's landing page names its run.
const chosen = ref<string | null>(typeof route.query.run === 'string' ? route.query.run : null)
// The page opens on the newest run, then stays on whichever is shown: a search another member sends doesn't move it.
watch(
  ordered,
  (all) => {
    if (chosen.value === null && all.length) chosen.value = all.at(-1)!.id
  },
  { immediate: true },
)
const position = computed(() => {
  const at = ordered.value.findIndex((r) => r.id === chosen.value)
  return at === -1 ? ordered.value.length - 1 : at
})
const current = computed(() => ordered.value[position.value])
const heading = ref<HTMLElement | null>(null)
/** The writer has just sent a search: show it, waiting its turn. */
function sent(run: Run) {
  chosen.value = run.id
}
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

      <ResearchForm class="mb-8" :publication-id="publicationId" :idea-id="id" @sent="sent" />

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
      <NextStep />
    </article>
  </IdeaGate>
</template>
