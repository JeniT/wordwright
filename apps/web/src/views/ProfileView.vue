<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { RouterLink, useRouter } from 'vue-router'
import ProfileImage from '../components/ProfileImage.vue'
import { api } from '../lib/api'
import { displayHost, useProfile } from '../lib/useProfiles'

const props = defineProps<{ profileId: string }>()
const router = useRouter()
const queryClient = useQueryClient()

const { profiles, profile } = useProfile(() => props.profileId)

const drafts = useQuery({
  queryKey: ['drafts', () => props.profileId],
  queryFn: () => api.listDrafts(props.profileId),
})
const ideas = useQuery({
  queryKey: ['ideas', () => props.profileId],
  queryFn: () => api.listIdeas(props.profileId),
})
const create = useMutation({
  mutationFn: () => api.createDraft(props.profileId, { title: 'Untitled' }),
  onSuccess: async (draft) => {
    await queryClient.invalidateQueries({ queryKey: ['drafts'] })
    await router.push({ name: 'draft', params: { profileId: props.profileId, id: draft.id } })
  },
})
</script>

<template>
  <p v-if="profiles.isPending.value">Loading…</p>
  <p v-else-if="profiles.isError.value" role="alert" class="text-red-700">
    We couldn't load this profile. Check your connection and try again.
  </p>
  <div v-else-if="!profile" role="alert" class="rounded border border-stone-200 bg-white p-6">
    <h1 class="font-serif text-lg">We couldn't find that profile</h1>
    <p class="mt-1 text-stone-700">
      It may have been deleted, or it may belong to someone who hasn't shared it with you.
    </p>
    <RouterLink to="/" class="mt-3 inline-block underline">Back to your profiles</RouterLink>
  </div>

  <div v-else>
    <header class="mb-8 flex items-center gap-4">
      <ProfileImage :id="profile.id" :name="profile.name" :image-url="profile.imageUrl" size="lg" />
      <div class="min-w-0 flex-1">
        <h1 class="truncate font-serif text-2xl font-semibold">{{ profile.name }}</h1>
        <p v-if="profile.siteUrl" class="truncate text-sm">
          <a :href="profile.siteUrl" target="_blank" rel="noopener noreferrer" class="underline">
            {{ displayHost(profile.siteUrl) }}
            <span class="sr-only">(opens in a new tab)</span>
          </a>
        </p>
        <p v-if="profile.members.length > 1" class="text-sm text-stone-600">
          Shared with {{ profile.members.length - 1 }}
          {{ profile.members.length === 2 ? 'person' : 'people' }}
        </p>
      </div>
      <RouterLink
        :to="{ name: 'profile-settings', params: { profileId: profile.id } }"
        class="rounded border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50"
      >
        Settings
      </RouterLink>
    </header>

    <section aria-labelledby="ideas-heading" class="mb-10">
      <div class="mb-4 flex items-center justify-between">
        <h2 id="ideas-heading" class="font-serif text-xl font-semibold">Ideas</h2>
        <RouterLink
          :to="{ name: 'new-idea', params: { profileId } }"
          class="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          New idea
        </RouterLink>
      </div>

      <p v-if="ideas.isPending.value">Loading…</p>
      <p v-else-if="ideas.isError.value" role="alert" class="text-red-700">
        Couldn't load ideas. Try reloading the page.
      </p>
      <p v-else-if="!ideas.data.value?.length" class="text-stone-600">
        No ideas yet. When one occurs to you, note it down here.
      </p>
      <ul v-else class="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
        <li v-for="idea in ideas.data.value" :key="idea.id">
          <RouterLink
            :to="{ name: 'idea', params: { profileId, id: idea.id } }"
            class="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-stone-50"
          >
            <span class="font-serif text-lg">{{ idea.name }}</span>
            <span class="shrink-0 text-sm text-stone-600">
              {{ idea.draftCount }} {{ idea.draftCount === 1 ? 'draft' : 'drafts' }}
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <section aria-labelledby="drafts-heading">
      <div class="mb-4 flex items-center justify-between">
        <h2 id="drafts-heading" class="font-serif text-xl font-semibold">Drafts</h2>
        <button
          type="button"
          class="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
          :disabled="create.isPending.value"
          @click="create.mutate()"
        >
          New draft
        </button>
      </div>

      <p v-if="drafts.isPending.value">Loading…</p>
      <p v-else-if="drafts.isError.value" role="alert" class="text-red-700">
        Couldn't load drafts. Try reloading the page.
      </p>
      <p v-else-if="!drafts.data.value?.length" class="text-stone-600">
        Nothing here yet. Start a new draft to begin.
      </p>
      <ul v-else class="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
        <li v-for="draft in drafts.data.value" :key="draft.id">
          <RouterLink
            :to="{ name: 'draft', params: { profileId, id: draft.id } }"
            class="flex items-baseline justify-between px-4 py-3 hover:bg-stone-50"
          >
            <span class="font-serif text-lg">{{ draft.title || 'Untitled' }}</span>
            <time class="text-sm text-stone-600" :datetime="draft.updatedAt">
              {{ new Date(draft.updatedAt).toLocaleDateString() }}
            </time>
          </RouterLink>
        </li>
      </ul>
      <p v-if="create.isError.value" role="alert" class="mt-2 text-red-700">
        Couldn't start a new draft. Please try again.
      </p>
    </section>
  </div>
</template>
