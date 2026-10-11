<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import IdeaLinkItem from '../components/IdeaLinkItem.vue'
import IdeaNotes from '../components/IdeaNotes.vue'
import ReorderableList from '../components/ReorderableList.vue'
import TextField from '../components/TextField.vue'
import { api, errorMessage } from '../lib/api'

const props = defineProps<{ profileId: string; id: string }>()
const router = useRouter()
const queryClient = useQueryClient()

const idea = useQuery({
  queryKey: ['idea', () => props.profileId, () => props.id],
  queryFn: () => api.getIdea(props.profileId, props.id),
})

// Fill the form once per idea. Later refreshes (a link was added) must not wipe unsaved typing.
const name = ref('')
let filledFor = ''
watch(
  () => idea.data.value,
  (loaded) => {
    if (loaded && filledFor !== loaded.id) {
      filledFor = loaded.id
      name.value = loaded.name
    }
  },
  { immediate: true },
)

// Whether the AI has been talking to the person about this idea already.
const conversation = useQuery({
  queryKey: ['conversation', () => props.profileId, () => props.id],
  queryFn: () => api.getConversation(props.profileId, props.id),
})
const hasConversation = computed(() => (conversation.data.value?.messages.length ?? 0) > 0)
/** Pressing Brainstorm on an idea with no conversation begins one straight away, with the AI's questions. */
const startsAtOnce = computed(() => !!conversation.data.value && !hasConversation.value)

const refreshLists = () => queryClient.invalidateQueries({ queryKey: ['ideas'] })
const setIdea = (saved: Awaited<ReturnType<typeof api.getIdea>>) => {
  queryClient.setQueryData(['idea', props.profileId, props.id], saved)
  return refreshLists()
}

const save = useMutation({
  mutationFn: () => api.updateIdea(props.profileId, props.id, { name: name.value }),
  onSuccess: setIdea,
})

const linkUrl = ref('')
// On failure what was typed stays in the field, with the reason shown under it.
const addLink = useMutation({
  mutationFn: () => api.addIdeaLink(props.profileId, props.id, { url: linkUrl.value }),
  onSuccess: async (saved) => {
    linkUrl.value = ''
    await setIdea(saved)
  },
})
const removeLink = useMutation({
  mutationFn: (linkId: string) => api.removeIdeaLink(props.profileId, props.id, linkId),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['idea'] }),
})

const moveDrafts = useMutation({
  mutationFn: (ids: string[]) => api.reorderIdeaDrafts(props.profileId, props.id, ids),
  onSuccess: (saved) => {
    void setIdea(saved) // the lists refresh in the background: nothing about the order waits on them
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

  <article v-else-if="idea.data.value" aria-labelledby="idea-heading" class="max-w-2xl">
    <p class="mb-2 text-sm">
      <RouterLink :to="{ name: 'profile', params: { profileId } }" class="underline">
        ← Back to the profile
      </RouterLink>
    </p>
    <h1 id="idea-heading" class="mb-6 font-display text-2xl font-semibold">
      {{ idea.data.value.name }}
    </h1>

    <form class="mb-10" @submit.prevent="save.mutate()">
      <TextField v-model="name" label="What's your core idea?" required autocomplete="off" />
      <div class="flex items-center gap-3">
        <button type="submit" class="btn btn-primary" :disabled="save.isPending.value">Save</button>
        <p role="status" class="text-sm text-ink-soft">
          <template v-if="save.isPending.value">Saving…</template>
          <template v-else-if="save.isSuccess.value">Saved</template>
        </p>
      </div>
      <p v-if="save.isError.value" role="alert" class="mt-2 text-danger">
        {{ errorMessage(save.error.value) }}
      </p>
    </form>

    <IdeaNotes :profile-id="profileId" :idea-id="id" :reading-list="idea.data.value.links" />

    <section aria-labelledby="links-heading" class="mb-10">
      <h2 id="links-heading" class="mb-1 font-display text-xl font-semibold">Reading list</h2>
      <p class="mb-3 text-sm text-ink-soft">
        Articles, papers or earlier posts that this idea builds on or responds to. Tick each one off
        once you have read it, even if you read it somewhere else.
      </p>
      <ul
        v-if="idea.data.value.links.length"
        class="mb-4 divide-y divide-line rounded-ctl border border-line bg-surface"
      >
        <IdeaLinkItem
          v-for="link in idea.data.value.links"
          :key="link.id"
          :profile-id="profileId"
          :idea-id="id"
          :link="link"
          @remove="removeLink.mutate(link.id)"
        />
      </ul>
      <p v-else class="mb-4 text-ink-soft">Nothing on the reading list yet.</p>
      <p v-if="removeLink.isError.value" role="alert" class="mb-3 text-danger">
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
          :invalid="addLink.isError.value"
          :hint="
            addLink.isError.value
              ? errorMessage(addLink.error.value)
              : 'For example, https://example.org/article. We look up its title for you.'
          "
          @update:model-value="addLink.isError.value && addLink.reset()"
        />
        <button type="submit" class="btn btn-outline" :disabled="addLink.isPending.value">
          {{ addLink.isPending.value ? 'Adding…' : 'Add link' }}
        </button>
      </form>
    </section>

    <section aria-labelledby="brainstorm-heading" class="mb-10">
      <h2 id="brainstorm-heading" class="mb-1 font-display text-xl font-semibold">Brainstorm</h2>
      <p class="mb-3 text-sm text-ink-soft">
        Talk the idea through with your AI assistant. It asks questions, adds the points you make to
        the notes above as you go, and can suggest a sharper title or a separate new idea, which
        change nothing unless you accept them.
      </p>
      <RouterLink
        :to="{
          name: 'brainstorm',
          params: { profileId, id },
          query: startsAtOnce ? { start: '1' } : {},
        }"
        class="btn btn-outline inline-block"
      >
        {{ hasConversation ? 'Continue brainstorming' : 'Brainstorm' }}
      </RouterLink>
    </section>

    <section aria-labelledby="research-heading" class="mb-10">
      <h2 id="research-heading" class="mb-1 font-display text-xl font-semibold">Research</h2>
      <p class="mb-3 text-sm text-ink-soft">
        Describe what you want to look into and your AI will search the web for pages worth reading,
        from more than one point of view. You review what it finds and choose what goes on the
        reading list above. You can research as many areas as you like.
      </p>
      <RouterLink
        :to="{ name: 'research', params: { profileId, id } }"
        class="btn btn-outline inline-block"
      >
        Research
      </RouterLink>
    </section>

    <section aria-labelledby="idea-drafts-heading" class="mb-10">
      <div class="mb-3 flex items-center justify-between gap-3">
        <h2 id="idea-drafts-heading" class="font-display text-xl font-semibold">Drafts</h2>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="addDraft.isPending.value"
          @click="addDraft.mutate()"
        >
          Add a draft
        </button>
      </div>
      <p class="mb-3 text-sm text-ink-soft">
        One draft for a single post, or several, in order, for a linked set of posts.
      </p>
      <p v-if="!idea.data.value?.drafts.length" class="text-ink-soft">
        No drafts yet. Add one when you're ready to start writing.
      </p>
      <ReorderableList
        v-else
        :items="idea.data.value.drafts"
        :item-label="(draft) => draft.title || 'Untitled'"
        :save="saveDraftOrder"
      >
        <template #default="{ item: draft }">
          <RouterLink
            :to="{ name: 'draft', params: { profileId, id: draft.id } }"
            class="flex min-w-0 flex-1 items-baseline justify-between gap-3 py-1 hover:bg-sunken"
          >
            <span class="min-w-0 break-words font-display text-lg">{{
              draft.title || 'Untitled'
            }}</span>
            <time class="shrink-0 text-sm text-ink-soft" :datetime="draft.updatedAt">
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

    <section
      aria-labelledby="delete-idea-heading"
      class="rounded-ctl border border-danger bg-surface p-4"
    >
      <h2 id="delete-idea-heading" class="mb-1 font-display text-lg font-semibold text-danger">
        Delete this idea
      </h2>
      <p class="mb-3 text-sm text-ink-soft">
        This permanently deletes the idea, its links and
        {{ idea.data.value?.drafts.length ? 'all its drafts' : 'any drafts' }}.
      </p>
      <p v-if="remove.isError.value" role="alert" class="mb-3 text-danger">
        {{ errorMessage(remove.error.value) }}
      </p>
      <button type="button" class="btn btn-danger" @click="confirmingDelete = true">
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
