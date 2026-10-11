<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { Profile } from '@lfwa/core'
import { useProfile } from '../lib/useProfiles'

/** Loading, error and not-found states for any page about one profile; the page itself is the slot. */
const props = defineProps<{ profileId: string }>()
defineSlots<{ default(props: { profile: Profile }): unknown }>()
const { profiles, profile } = useProfile(() => props.profileId)
</script>

<template>
  <p v-if="profiles.isPending.value">Loading…</p>
  <p v-else-if="profiles.isError.value" role="alert" class="text-danger">
    We couldn't load this profile. Check your connection and try again.
  </p>
  <div v-else-if="!profile" role="alert" class="panel p-6">
    <h1 class="text-lg font-semibold">We couldn't find that profile</h1>
    <p class="mt-1 text-ink-soft">
      It may have been deleted, or it may belong to someone who hasn't shared it with you.
    </p>
    <RouterLink to="/" class="link mt-3 inline-block">Back to your profiles</RouterLink>
  </div>
  <slot v-else :profile="profile" />
</template>
