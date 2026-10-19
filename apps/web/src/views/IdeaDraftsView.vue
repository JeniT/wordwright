<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { RouterLink } from 'vue-router'
import Explain from '../components/Explain.vue'
import IdeaGate from '../components/IdeaGate.vue'
import ReorderableList from '../components/ReorderableList.vue'
import StartDraftButton from '../components/StartDraftButton.vue'
import StepHeading from '../components/StepHeading.vue'
import { invalidateRoots, queryKeys } from '../lib/queries'
import { api, errorMessage } from '../lib/api'

/** Step 04 of an idea: its drafts. One for a single post, or several, in order, for a linked set of posts. */
const props = defineProps<{ publicationId: string; id: string }>()
const queryClient = useQueryClient()

const refreshLists = () => invalidateRoots(queryClient, 'ideas')

const moveDrafts = useMutation({
  mutationFn: (ids: string[]) => api.reorderIdeaDrafts(props.publicationId, props.id, ids),
  onSuccess: (saved) => {
    queryClient.setQueryData(queryKeys.idea(props.publicationId, props.id), saved)
    void refreshLists() // the lists refresh in the background: nothing about the order waits on them
  },
  // The list on screen may be out of date (the 409 says so); show the server's.
  onError: () => invalidateRoots(queryClient, 'idea'),
})

/** Saves a new draft order; true if it was saved (the error is shown under the list). */
async function saveDraftOrder(ids: string[]) {
  try {
    await moveDrafts.mutateAsync(ids)
  } catch {
    return false
  }
  return true
}
</script>

<template>
  <IdeaGate :id="id" v-slot="{ idea }" :publication-id="publicationId">
    <StepHeading>Draft</StepHeading>
    <Explain tutorial-only class="mb-3">
      A draft is one piece of writing. Add several, in order, for a linked set of posts.
    </Explain>
    <div class="mb-3 flex justify-end">
      <StartDraftButton :publication-id="publicationId" :idea-id="id" />
    </div>
    <section aria-label="Drafts">
      <p v-if="!idea.drafts.length" class="text-ink-soft">
        No drafts yet. Start one when you’re ready to write.
      </p>
      <ReorderableList
        v-else
        :items="idea.drafts"
        :item-label="(draft) => draft.title || 'Untitled'"
        :save="saveDraftOrder"
      >
        <template #default="{ item: draft }">
          <RouterLink
            :to="{ name: 'draft', params: { publicationId, id: draft.id } }"
            class="flex min-w-0 flex-1 items-baseline justify-between gap-3 py-1 no-underline hover:bg-sunken"
          >
            <span class="min-w-0 text-lg font-semibold break-words">{{
              draft.title || 'Untitled'
            }}</span>
            <time class="meta shrink-0" :datetime="draft.updatedAt">
              <span class="sr-only">Last changed </span
              >{{
                new Date(draft.updatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
              }}
            </time>
          </RouterLink>
        </template>
      </ReorderableList>
      <p v-if="moveDrafts.isError.value" role="alert" class="mt-2 text-danger">
        {{ errorMessage(moveDrafts.error.value) }}
      </p>
    </section>
  </IdeaGate>
</template>
