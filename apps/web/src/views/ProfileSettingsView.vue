<script setup lang="ts">
import { RouterLink } from 'vue-router'
import ProfileSettingsPanel from '../components/ProfileSettingsPanel.vue'
import { useProfile } from '../lib/useProfiles'

const props = defineProps<{ profileId: string }>()
const { profiles, profile } = useProfile(() => props.profileId)
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
  <ProfileSettingsPanel v-else :key="profile.id" :profile="profile" />
</template>
