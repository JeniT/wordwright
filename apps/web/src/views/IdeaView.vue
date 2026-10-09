<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import TextAreaField from '../components/TextAreaField.vue'
import TextField from '../components/TextField.vue'
import { api, errorMessage } from '../lib/api'
import { displayHost } from '../lib/useProfiles'

const props = defineProps<{ profileId: string; id: string }>()
const router = useRouter()
const queryClient = useQueryClient()

const idea = useQuery({
  queryKey: ['idea', () => props.profileId, () => props.id],
  queryFn: () => api.getIdea(props.profileId, props.id),
})

// Fill the form once per idea. Later refreshes (a link was added) must not wipe unsaved typing.
const name = ref('')
const notes = ref('')
let filledFor = ''
watch(
  () => idea.data.value,
  (loaded) => {
    if (loaded && filledFor !== loaded.id) {
      filledFor = loaded.id
      name.value = loaded.name
      notes.value = loaded.notes
    }
  },
  { immediate: true },
)

const refreshLists = () => queryClient.invalidateQueries({ queryKey: ['ideas'] })
const setIdea = (saved: Awaited<ReturnType<typeof api.getIdea>>) => {
  queryClient.setQueryData(['idea', props.profileId, props.id], saved)
  return refreshLists()
}

const save = useMutation({
  mutationFn: () =>
    api.updateIdea(props.profileId, props.id, { name: name.value, notes: notes.value }),
  onSuccess: setIdea,
})

const linkUrl = ref('')
const linkTitle = ref('')
const addLink = useMutation({
  mutationFn: () =>
    api.addIdeaLink(props.profileId, props.id, { url: linkUrl.value, title: linkTitle.value }),
  onSuccess: async (saved) => {
    linkUrl.value = ''
    linkTitle.value = ''
    await setIdea(saved)
  },
})
const removeLink = useMutation({
  mutationFn: (linkId: string) => api.removeIdeaLink(props.profileId, props.id, linkId),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['idea'] }),
})

const addDraft = useMutation({
  mutationFn: () => api.createIdeaDraft(props.profileId, props.id, { title: 'Untitled' }),
  onSuccess: async (draft) => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['idea'] }), refreshLists()])
    await router.push({ name: 'draft', params: { profileId: props.profileId, id: draft.id } })
  },
})

const confirmingDelete = ref(false)
const remove = useMutation({
  mutationFn: () => api.deleteIdea(props.profileId, props.id),
  onSuccess: async () => {
    queryClient.removeQueries({ queryKey: ['idea', props.profileId, props.id] })
    await refreshLists()
    await router.push({ name: 'profile', params: { profileId: props.profileId } })
  },
  onSettled: () => (confirmingDelete.value = false),
})

const button =
  'rounded px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60'
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

  <article v-else-if="idea.data.value" aria-labelledby="idea-heading" class="max-w-2xl">
    <p class="mb-2 text-sm">
      <RouterLink :to="{ name: 'profile', params: { profileId } }" class="underline">
        ← Back to the profile
      </RouterLink>
    </p>
    <h1 id="idea-heading" class="mb-6 font-serif text-2xl font-semibold">
      {{ idea.data.value.name }}
    </h1>

    <form class="mb-10" @submit.prevent="save.mutate()">
      <TextField v-model="name" label="What's your core idea?" required autocomplete="off" />
      <TextAreaField v-model="notes" label="Expand on your idea here" :rows="8" />
      <div class="flex items-center gap-3">
        <button
          type="submit"
          :class="[button, 'bg-accent text-white hover:opacity-90']"
          :disabled="save.isPending.value"
        >
          Save
        </button>
        <p role="status" class="text-sm text-stone-600">
          <template v-if="save.isPending.value">Saving…</template>
          <template v-else-if="save.isSuccess.value">Saved</template>
        </p>
      </div>
      <p v-if="save.isError.value" role="alert" class="mt-2 text-red-700">
        {{ errorMessage(save.error.value) }}
      </p>
    </form>

    <section aria-labelledby="links-heading" class="mb-10">
      <h2 id="links-heading" class="mb-1 font-serif text-xl font-semibold">Related work</h2>
      <p class="mb-3 text-sm text-stone-700">
        Articles, papers or earlier posts that this idea builds on or responds to.
      </p>
      <ul
        v-if="idea.data.value.links.length"
        class="mb-4 divide-y divide-stone-200 rounded border border-stone-200 bg-white"
      >
        <li
          v-for="link in idea.data.value.links"
          :key="link.id"
          class="flex items-center justify-between gap-3 px-4 py-3"
        >
          <a :href="link.url" target="_blank" rel="noopener noreferrer" class="min-w-0 underline">
            <span class="block truncate">{{ link.title || displayHost(link.url) }}</span>
            <span v-if="link.title" class="block truncate text-sm text-stone-600">
              {{ displayHost(link.url) }}
            </span>
            <span class="sr-only">(opens in a new tab)</span>
          </a>
          <button
            type="button"
            :class="[button, 'border border-stone-300 text-sm hover:bg-stone-50']"
            :aria-label="`Remove link to ${link.title || displayHost(link.url)}`"
            :disabled="removeLink.isPending.value"
            @click="removeLink.mutate(link.id)"
          >
            Remove
          </button>
        </li>
      </ul>
      <p v-else class="mb-4 text-stone-600">No links yet.</p>
      <p v-if="removeLink.isError.value" role="alert" class="mb-3 text-red-700">
        Couldn't remove that link. Please try again.
      </p>

      <form @submit.prevent="addLink.mutate()">
        <TextField
          v-model="linkUrl"
          label="Web address"
          required
          autocomplete="off"
          autocapitalize="none"
          :spellcheck="false"
          hint="For example, https://example.org/article."
        />
        <TextField v-model="linkTitle" label="Title (optional)" autocomplete="off" />
        <p v-if="addLink.isError.value" role="alert" class="mb-3 text-red-700">
          {{ errorMessage(addLink.error.value) }}
        </p>
        <button
          type="submit"
          :class="[button, 'border border-accent text-accent hover:bg-stone-100']"
          :disabled="addLink.isPending.value"
        >
          Add link
        </button>
      </form>
    </section>

    <section aria-labelledby="brainstorm-heading" class="mb-10">
      <h2 id="brainstorm-heading" class="mb-1 font-serif text-xl font-semibold">Brainstorm</h2>
      <p id="brainstorm-hint" class="mb-3 text-sm text-stone-700">
        Talk the idea through with your AI assistant. This isn't ready yet.
      </p>
      <button
        type="button"
        :class="[button, 'border border-accent text-accent']"
        disabled
        aria-describedby="brainstorm-hint"
      >
        Brainstorm
      </button>
    </section>

    <section aria-labelledby="idea-drafts-heading" class="mb-10">
      <div class="mb-3 flex items-center justify-between gap-3">
        <h2 id="idea-drafts-heading" class="font-serif text-xl font-semibold">Drafts</h2>
        <button
          type="button"
          :class="[button, 'bg-accent text-white hover:opacity-90']"
          :disabled="addDraft.isPending.value"
          @click="addDraft.mutate()"
        >
          Add a draft
        </button>
      </div>
      <p class="mb-3 text-sm text-stone-700">
        One draft for a single post, or several, in order, for a linked set of posts.
      </p>
      <p v-if="!idea.data.value?.drafts.length" class="text-stone-600">
        No drafts yet. Add one when you're ready to start writing.
      </p>
      <ol v-else class="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
        <li v-for="draft in idea.data.value?.drafts" :key="draft.id">
          <RouterLink
            :to="{ name: 'draft', params: { profileId, id: draft.id } }"
            class="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-stone-50"
          >
            <span class="font-serif text-lg">{{ draft.title || 'Untitled' }}</span>
            <time class="shrink-0 text-sm text-stone-600" :datetime="draft.updatedAt">
              {{ new Date(draft.updatedAt).toLocaleDateString() }}
            </time>
          </RouterLink>
        </li>
      </ol>
      <p v-if="addDraft.isError.value" role="alert" class="mt-2 text-red-700">
        Couldn't start a new draft. Please try again.
      </p>
    </section>

    <section
      aria-labelledby="delete-idea-heading"
      class="rounded border border-red-200 bg-white p-4"
    >
      <h2 id="delete-idea-heading" class="mb-1 font-serif text-lg font-semibold text-red-900">
        Delete this idea
      </h2>
      <p class="mb-3 text-sm text-stone-700">
        This permanently deletes the idea, its links and
        {{ idea.data.value?.drafts.length ? 'all its drafts' : 'any drafts' }}.
      </p>
      <p v-if="remove.isError.value" role="alert" class="mb-3 text-red-700">
        {{ errorMessage(remove.error.value) }}
      </p>
      <button
        type="button"
        :class="[button, 'border border-red-700 text-red-800 hover:bg-red-50']"
        @click="confirmingDelete = true"
      >
        Delete idea
      </button>
    </section>

    <ConfirmDialog
      :open="confirmingDelete"
      title="Delete this idea?"
      confirm-label="Yes, delete it"
      :busy="remove.isPending.value"
      @confirm="remove.mutate()"
      @cancel="confirmingDelete = false"
    >
      “{{ idea.data.value?.name }}” will be deleted along with its links and drafts. This can't be
      undone.
    </ConfirmDialog>
  </article>
</template>
