<script setup lang="ts">
import { RouterLink } from 'vue-router'
import ReadingList from '../components/ReadingList.vue'
import { useProfile } from '../lib/useProfiles'

/** The profile's own reading list: things to read before there is an idea. */
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
        ← {{ profile.name }}
      </RouterLink>
    </p>
    <h1 class="mb-6 font-display text-2xl font-semibold">Reading list</h1>
    <p class="mb-6">
      <RouterLink :to="{ name: 'inspiration', params: { profileId } }" class="btn btn-primary">
        Add to reading list
      </RouterLink>
      <span class="ml-3 text-sm text-ink-soft">
        Choose from the latest posts of your feeds on the Inspiration page.
      </span>
    </p>
    <ReadingList :profile-id="profileId" :idea-id="null" quiet-heading />
    <p class="text-sm text-ink-soft">
      Notes you take from these are kept with
      <RouterLink :to="{ name: 'profile-notes', params: { profileId } }" class="underline">
        the profile’s notes</RouterLink
      >.
    </p>
  </div>
</template>
