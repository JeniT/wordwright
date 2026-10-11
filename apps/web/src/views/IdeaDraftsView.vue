<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { RouterLink, useRouter } from 'vue-router'
import IdeaGate from '../components/IdeaGate.vue'
import NextStep from '../components/NextStep.vue'
import ReorderableList from '../components/ReorderableList.vue'
import StepHeading from '../components/StepHeading.vue'
import { api, errorMessage } from '../lib/api'

/** Step 04 of an idea: its drafts. One for a single post, or several, in order, for a linked set of posts. */
const props = defineProps<{ profileId: string; id: string }>()
const router = useRouter()
const queryClient = useQueryClient()

const refreshLists = () => queryClient.invalidateQueries({ queryKey: ['ideas'] })

const moveDrafts = useMutation({
  mutationFn: (ids: string[]) => api.reorderIdeaDrafts(props.profileId, props.id, ids),
  onSuccess: (saved) => {
    queryClient.setQueryData(['idea', props.profileId, props.id], saved)
    void refreshLists() // the lists refresh in the background: nothing about the order waits on them
  },
  // The list on screen may be out of date (the 409 says so); show the server's.
  onError: () => queryClient.invalidateQueries({ queryKey: ['idea'] }),
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

const addDraft = useMutation({
  mutationFn: () => api.createIdeaDraft(props.profileId, props.id, { title: 'Untitled' }),
  onSuccess: async (draft) => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['idea'] }), refreshLists()])
    await router.push({ name: 'draft', params: { profileId: props.profileId, id: draft.id } })
  },
})
</script>

<template>
  <IdeaGate :id="id" v-slot="{ idea }" :profile-id="profileId">
    <StepHeading>Draft</StepHeading>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p class="max-w-prose text-sm text-ink-soft">
        One draft for a single post, or several, in order, for a linked set of posts. Open one to
        write; your notes sit beside it.
      </p>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="addDraft.isPending.value"
        @click="addDraft.mutate()"
      >
        Add a draft
      </button>
    </div>
    <section aria-label="Drafts">
      <p v-if="!idea.drafts.length" class="text-ink-soft">
        No drafts yet. Add one when you're ready to start writing.
      </p>
      <ReorderableList
        v-else
        :items="idea.drafts"
        :item-label="(draft) => draft.title || 'Untitled'"
        :save="saveDraftOrder"
      >
        <template #default="{ item: draft }">
          <RouterLink
            :to="{ name: 'draft', params: { profileId, id: draft.id } }"
            class="flex min-w-0 flex-1 items-baseline justify-between gap-3 py-1 no-underline hover:bg-sunken"
          >
            <span class="min-w-0 text-lg font-semibold break-words">{{
              draft.title || 'Untitled'
            }}</span>
            <time class="meta shrink-0" :datetime="draft.updatedAt">
              {{ new Date(draft.updatedAt).toLocaleDateString() }}
            </time>
          </RouterLink>
        </template>
      </ReorderableList>
      <p v-if="moveDrafts.isError.value" role="alert" class="mt-2 text-danger">
        {{ errorMessage(moveDrafts.error.value) }}
      </p>
      <p v-if="addDraft.isError.value" role="alert" class="mt-2 text-danger">
        Couldn't start a new draft. Please try again.
      </p>
    </section>
    <NextStep
      v-if="idea.drafts.length"
      :to="{ name: 'idea-publish', params: { profileId, id } }"
      label="Next: 05 Publish"
    >
      When a draft is ready, get it ready to send out.
    </NextStep>
  </IdeaGate>
</template>
