<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { RouterLink } from 'vue-router'
import ProfileImage from '../components/ProfileImage.vue'
import { api } from '../lib/api'
import { displayHost, useProfile } from '../lib/useProfiles'

const props = defineProps<{ profileId: string }>()

const { profiles, profile } = useProfile(() => props.profileId)

const ideas = useQuery({
  queryKey: ['ideas', () => props.profileId],
  queryFn: () => api.listIdeas(props.profileId),
})
</script>

<template>
  <p v-if="profiles.isPending.value">Loading…</p>
  <p v-else-if="profiles.isError.value" role="alert" class="text-danger">
    We couldn't load this profile. Check your connection and try again.
  </p>
  <div v-else-if="!profile" role="alert" class="panel p-6">
    <h1 class="font-display text-lg">We couldn't find that profile</h1>
    <p class="mt-1 text-ink-soft">
      It may have been deleted, or it may belong to someone who hasn't shared it with you.
    </p>
    <RouterLink to="/" class="mt-3 inline-block underline">Back to your profiles</RouterLink>
  </div>

  <div v-else>
    <header class="mb-8 flex items-center gap-4">
      <ProfileImage :id="profile.id" :name="profile.name" :image-url="profile.imageUrl" size="lg" />
      <div class="min-w-0 flex-1">
        <h1 class="truncate font-display text-2xl font-semibold">{{ profile.name }}</h1>
        <p v-if="profile.siteUrl" class="truncate text-sm">
          <a :href="profile.siteUrl" target="_blank" rel="noopener noreferrer" class="underline">
            {{ displayHost(profile.siteUrl) }}
            <span class="sr-only">(opens in a new tab)</span>
          </a>
        </p>
        <p v-if="profile.members.length > 1" class="text-sm text-ink-soft">
          Shared with {{ profile.members.length - 1 }}
          {{ profile.members.length === 2 ? 'person' : 'people' }}
        </p>
      </div>
      <RouterLink
        :to="{ name: 'inspiration', params: { profileId: profile.id } }"
        class="btn btn-neutral btn-sm"
      >
        Inspiration
      </RouterLink>
      <RouterLink
        :to="{ name: 'profile-settings', params: { profileId: profile.id } }"
        class="btn btn-neutral btn-sm"
      >
        Settings
      </RouterLink>
    </header>

    <section aria-labelledby="ideas-heading">
      <div class="mb-4 flex items-center justify-between">
        <h2 id="ideas-heading" class="font-display text-xl font-semibold">Ideas</h2>
        <RouterLink :to="{ name: 'new-idea', params: { profileId } }" class="btn btn-primary">
          New idea
        </RouterLink>
      </div>

      <p v-if="ideas.isPending.value">Loading…</p>
      <p v-else-if="ideas.isError.value" role="alert" class="text-danger">
        Couldn't load ideas. Try reloading the page.
      </p>
      <p v-else-if="!ideas.data.value?.length" class="text-ink-soft">
        No ideas yet. When one occurs to you, note it down here, then draft it from there.
      </p>
      <ul v-else class="divide-y divide-line rounded-ctl border border-line bg-surface">
        <li v-for="idea in ideas.data.value" :key="idea.id">
          <RouterLink
            :to="{ name: 'idea', params: { profileId, id: idea.id } }"
            class="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-sunken"
          >
            <span class="font-display text-lg">{{ idea.name }}</span>
            <span class="shrink-0 text-sm text-ink-soft">
              {{ idea.draftCount }} {{ idea.draftCount === 1 ? 'draft' : 'drafts' }}
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>
