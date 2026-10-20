<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { ACTIVE_DRAFTS_PAGE } from '@wordwright/core'
import { draftReviewSummary } from '../lib/review-request'
import { useActiveDrafts } from '../lib/queries'
import DraftRow from './DraftRow.vue'
import QueryState from './QueryState.vue'
import RowList from './RowList.vue'

/**
 * The drafts the person edits that are worth carrying on with (#310): saved lately, or with a review in progress, or
 * with comments waiting for them. On Home it is all of them; on a publication's or an idea's landing page, those within
 * it. Each row is a link straight into writing. It starts with a few and "Show more" adds more below them. Nothing
 * active is nothing to show: no heading and no gap.
 */
const props = defineProps<{ publicationId?: string; ideaId?: string }>()

const limit = ref(ACTIVE_DRAFTS_PAGE)
const drafts = useActiveDrafts(
  () => ({ publicationId: props.publicationId, ideaId: props.ideaId }),
  () => limit.value,
)
const shown = computed(() => drafts.data.value?.drafts ?? [])

/** What the page doesn't already say: Home names idea and publication, a publication page the idea, an idea page neither. */
const context = (d: { ideaName: string; publicationName: string }) =>
  props.ideaId ? '' : props.publicationId ? d.ideaName : `${d.ideaName} · ${d.publicationName}`

// Focus goes to the first row the button added, once it has arrived, so a keyboard user carries on from there.
const list = useTemplateRef<HTMLElement>('list')
let firstNew: number | null = null
function showMore() {
  firstNew = shown.value.length
  limit.value += ACTIVE_DRAFTS_PAGE
}
watch(
  () => drafts.isPlaceholderData.value,
  async (waiting) => {
    if (waiting || firstNew === null) return
    const at = firstNew
    firstNew = null
    await nextTick()
    list.value?.querySelectorAll('a')[at]?.focus()
  },
)
</script>

<template>
  <section
    v-if="drafts.isPending.value || drafts.isError.value || shown.length"
    aria-labelledby="keep-writing-heading"
  >
    <h2 id="keep-writing-heading" class="mb-2 font-display text-xl font-semibold">Keep writing</h2>
    <QueryState :query="drafts" what="your drafts">
      <div ref="list">
        <RowList :items="shown" label="Drafts to keep writing" bare>
          <template #default="{ item: d }">
            <DraftRow
              :to="{ name: 'draft', params: { publicationId: d.publicationId, id: d.id } }"
              :title="d.title"
              :updated-at="d.updatedAt"
              :context="context(d)"
              :review="draftReviewSummary(d.review)"
            />
          </template>
        </RowList>
      </div>
      <p v-if="drafts.data.value?.hasMore" class="mt-3">
        <button
          type="button"
          class="btn btn-sm btn-outline"
          :disabled="drafts.isPlaceholderData.value"
          :aria-busy="drafts.isPlaceholderData.value"
          @click="showMore"
        >
          Show more
        </button>
      </p>
    </QueryState>
  </section>
</template>
