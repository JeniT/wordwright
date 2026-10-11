<script setup lang="ts">
import { RouterLink } from 'vue-router'
import RecentPosts from '../components/RecentPosts.vue'
import ProfileSources from '../components/ProfileSources.vue'
import { useProfile } from '../lib/useProfiles'

const props = defineProps<{ profileId: string }>()
const { profiles, profile } = useProfile(() => props.profileId)
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
  <div v-else class="max-w-2xl">
    <p class="mb-2 text-sm">
      <RouterLink :to="{ name: 'profile', params: { profileId } }" class="underline">
        {{ profile.name }}
      </RouterLink>
    </p>
    <h1 class="mb-2 font-display text-2xl font-semibold">Inspiration</h1>
    <p class="mb-8 text-ink-soft">
      Where ideas for {{ profile.name }} can come from. Choose the blogs, newsletters, news and
      journals you’d like to look through for things worth writing about.
    </p>
    <RecentPosts :profile-id="profileId" />
    <ProfileSources :profile-id="profileId" />
  </div>
</template>
