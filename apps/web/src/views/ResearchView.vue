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
  <div
    v-else-if="idea.isError.value"
    role="alert"
    class="rounded border border-stone-200 bg-white p-6"
  >
    <h1 class="font-serif text-lg">We couldn't open that idea</h1>
    <p class="mt-1 text-stone-700">
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
    <h1 id="research-title" class="font-serif text-2xl font-semibold">Research</h1>
    <p class="mb-2 font-serif text-lg text-stone-700">{{ idea.data.value.name }}</p>
    <p class="mb-6 text-sm text-stone-600">
      Describe the areas you want to look into and your AI will search the web for pages worth
      reading, including some that may not agree with you. It only suggests: you review what it
      finds, and nothing joins the reading list until you tick it and add it. The idea's title and
      notes, the addresses already on its reading list and what you write here are sent to your AI
      provider, which does the searching; the text of your drafts never is. Everyone in this profile
      sees the research.
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
        class="mb-2 w-full rounded border border-stone-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent disabled:bg-stone-100"
        @keydown.enter.ctrl.exact.prevent="submit"
        @keydown.enter.meta.exact.prevent="submit"
      ></textarea>
      <p id="research-hint" class="mb-2 text-sm text-stone-600">
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
      <p v-if="search.isPending.value" role="status" class="mt-2 text-sm text-stone-700">
        Searching the web. This can take up to a minute.
      </p>
      <div
        v-if="search.isError.value"
        role="alert"
        class="mt-3 rounded border border-red-200 bg-red-50 p-3 text-red-900"
      >
        <p>{{ errorMessage(search.error.value) }}</p>
        <p v-if="needsKey" class="mt-1">
          <RouterLink to="/account" class="underline">Go to account settings</RouterLink>
        </p>
      </div>
    </form>

    <section aria-labelledby="previous-heading">
      <h2 id="previous-heading" class="mb-3 font-serif text-xl font-semibold">Research so far</h2>
      <p v-if="runs.isPending.value">Loading…</p>
      <p v-else-if="runs.isError.value" role="alert" class="text-red-700">
        We couldn't load the research. Check your connection and reload the page.
      </p>
      <p v-else-if="!runs.data.value?.length" class="text-stone-700">
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
