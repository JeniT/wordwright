<script setup lang="ts">
import { RouterLink } from 'vue-router'
import ProfileGate from '../components/ProfileGate.vue'
import VenueDescriptionFlow from '../components/VenueDescriptionFlow.vue'

/** Describe a venue: guidance on what a description needs, and a box to write it in. Optional; reachable from the profile. */
defineProps<{ profileId: string }>()
</script>

<template>
  <ProfileGate v-slot="{ profile }" :profile-id="profileId">
    <section aria-labelledby="describe-heading" class="max-w-xl">
      <p class="mb-2 text-sm">
        <RouterLink :to="{ name: 'profile', params: { profileId: profile.id } }" class="underline">
          ← {{ profile.name }}
        </RouterLink>
      </p>
      <h1 id="describe-heading" class="mb-1 font-display text-2xl font-semibold">
        Describe this venue
      </h1>
      <p class="mb-6 text-ink-soft">
        What it is, who reads it and what kinds of writing go there. It is shown at the top of the
        profile and helps the assistants understand what you are writing for. You write it yourself,
        and you can skip this and come back to it.
      </p>
      <VenueDescriptionFlow :key="profile.id" :profile="profile" />
    </section>
  </ProfileGate>
</template>
