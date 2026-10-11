<script setup lang="ts">
import { RouterLink } from 'vue-router'
import IdeaNotes from '../components/IdeaNotes.vue'
import { useReadingList } from '../lib/reading'
import { useProfile } from '../lib/useProfiles'

/** The profile's own notes: made while reading, or jotted down, before they belong to an idea. */
const props = defineProps<{ profileId: string }>()
const { profiles, profile } = useProfile(() => props.profileId)
// Each note says which item of the reading list it was taken from.
const reading = useReadingList(() => ({ profileId: props.profileId, ideaId: null }))
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
    <h1 class="mb-6 font-display text-2xl font-semibold">Notes</h1>
    <IdeaNotes :profile-id="profileId" :idea-id="null" :reading-list="reading.links.value ?? []" />
    <p class="text-sm text-ink-soft">
      Take notes from something you are reading on the
      <RouterLink :to="{ name: 'profile-reading', params: { profileId } }" class="underline">
        profile’s reading list</RouterLink
      >.
    </p>
  </div>
</template>
