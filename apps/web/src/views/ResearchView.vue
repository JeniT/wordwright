<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { RESEARCH_AREAS_MAX } from '@lfwa/core'
import ResearchRun from '../components/ResearchRun.vue'
import { ApiError, api, errorMessage } from '../lib/api'

const props = defineProps<{ profileId: string; id: string }>()
const queryClient = useQueryClient()

const idea = useQuery({
  queryKey: ['idea', () => props.profileId, () => props.id],
  queryFn: () => api.getIdea(props.profileId, props.id),
})
const runs = useQuery({
  queryKey: ['research', () => props.profileId, () => props.id],
  queryFn: () => api.getResearch(props.profileId, props.id),
})

const areas = ref('')
const search = useMutation({
  mutationFn: (text: string) => api.runResearch(props.profileId, props.id, text),
  onSuccess: () => (areas.value = ''),
  // Another member may have researched too, so read the whole list again.
  onSettled: () => queryClient.invalidateQueries({ queryKey: ['research'] }),
})
const needsKey = computed(() => {
  const err = search.error.value
  return err instanceof ApiError && err.status === 409 && /API key/i.test(err.message)
})
function submit() {
  const text = areas.value.trim()
  if (!text || search.isPending.value) return
  search.mutate(text)
}
</script>

<template>
  <p v-if="idea.isPending.value">Loading…</p>
  <div v-else-if="idea.isError.value" role="alert" class="panel p-6">
    <h1 class="font-display text-lg">We couldn't open that idea</h1>
    <p class="mt-1 text-ink-soft">
      It may have been deleted, or the connection may have dropped. Try reloading the page.
    </p>
    <RouterLink
      :to="{ name: 'profile', params: { profileId } }"
      class="mt-3 inline-block underline"
    >
      Back to the profile
    </RouterLink>
  </div>

  <article v-else-if="idea.data.value" aria-labelledby="research-title" class="max-w-2xl">
    <p class="mb-2 text-sm">
      <RouterLink :to="{ name: 'idea', params: { profileId, id } }" class="underline">
        ← Back to the idea
      </RouterLink>
    </p>
    <h1 id="research-title" class="font-display text-2xl font-semibold">Research</h1>
    <p class="mb-2 font-display text-lg text-ink-soft">{{ idea.data.value.name }}</p>
    <p class="mb-6 text-sm text-ink-soft">
      Describe the areas you want to look into and your AI will search the web for pages worth
      reading, including some that may not agree with you. It only suggests: you review what it
      finds, and nothing joins the reading list until you add it. The idea's title and notes, the
      addresses already on its reading list and what you write here are sent to your AI provider,
      which does the searching; the text of your drafts never is. Everyone in this profile sees the
      research.
    </p>

    <form class="mb-8" @submit.prevent="submit">
      <label for="research-areas" class="mb-1 block text-sm font-medium">
        What areas do you want to research?
      </label>
      <textarea
        id="research-areas"
        v-model="areas"
        rows="4"
        :maxlength="RESEARCH_AREAS_MAX"
        :disabled="search.isPending.value"
        aria-describedby="research-hint"
        class="field mb-2"
        @keydown.enter.ctrl.exact.prevent="submit"
        @keydown.enter.meta.exact.prevent="submit"
      ></textarea>
      <p id="research-hint" class="mb-2 text-sm text-ink-soft">
        For example: how fast river bends move, and what engineers have learned from straightening
        rivers. You can research other areas afterwards. Searching can take up to a minute.
      </p>
      <button
        type="submit"
        class="btn btn-primary"
        :disabled="!areas.trim() || search.isPending.value"
      >
        {{ search.isPending.value ? 'Searching…' : 'Research' }}
      </button>
      <p v-if="search.isPending.value" role="status" class="mt-2 text-sm text-ink-soft">
        Searching the web. This can take up to a minute.
      </p>
      <div
        v-if="search.isError.value"
        role="alert"
        class="mt-3 rounded-ctl border border-danger bg-danger-wash p-3 text-danger"
      >
        <p>{{ errorMessage(search.error.value) }}</p>
        <p v-if="needsKey" class="mt-1">
          <RouterLink to="/account" class="underline">Go to account settings</RouterLink>
        </p>
      </div>
    </form>

    <section aria-labelledby="previous-heading">
      <h2 id="previous-heading" class="mb-3 font-display text-xl font-semibold">Research so far</h2>
      <p v-if="runs.isPending.value">Loading…</p>
      <p v-else-if="runs.isError.value" role="alert" class="text-danger">
        We couldn't load the research. Check your connection and reload the page.
      </p>
      <p v-else-if="!runs.data.value?.length" class="text-ink-soft">
        Nothing yet. What you research will be kept here.
      </p>
      <ul v-else class="space-y-5">
        <li v-for="run in runs.data.value" :key="run.id">
          <ResearchRun :profile-id="profileId" :idea-id="id" :run="run" />
        </li>
      </ul>
    </section>
  </article>
</template>
