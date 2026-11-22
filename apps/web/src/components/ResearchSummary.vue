<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthorship } from '../lib/authorship'
import { useResearch } from '../lib/queries'
import { researchSummary } from '../lib/research-state'
import QueryState from './QueryState.vue'
import RowList from './RowList.vue'

/**
 * Every research run of an idea, newest first, for its landing page (#447): what was asked, as a link to that run on
 * the Research page, and one line on where it is. No buttons: cancelling, trying again and the results live there.
 * While a search is waiting or searching, the list is read again every few seconds.
 */
const props = defineProps<{ publicationId: string; ideaId: string }>()
const runs = useResearch(
  () => props.publicationId,
  () => props.ideaId,
)
const { shared } = useAuthorship(() => props.publicationId)
const newestFirst = computed(() =>
  [...(runs.data.value ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
)
</script>

<template>
  <div>
    <QueryState :query="runs" what="the research">
      <p v-if="!newestFirst.length" class="text-ink-soft">No research yet.</p>
      <RowList v-else :items="newestFirst" label="Research so far" bare>
        <template #default="{ item: run }">
          <div class="px-4 py-3">
            <RouterLink
              :to="{
                name: 'idea-research',
                params: { publicationId, id: ideaId },
                query: { run: run.id },
              }"
              class="link line-clamp-2 font-semibold break-words"
            >
              {{ run.areas }}
            </RouterLink>
            <p class="mt-1 text-sm text-ink-soft">
              {{ researchSummary(run)
              }}<template v-if="shared && run.createdByName"> · {{ run.createdByName }}</template>
            </p>
          </div>
        </template>
      </RowList>
    </QueryState>
  </div>
</template>
