<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import LlmSettingsSection from '../components/LlmSettingsSection.vue'
import ProfileImage from '../components/ProfileImage.vue'
import { api } from '../lib/api'
import { displayHost, useProfiles } from '../lib/useProfiles'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const profiles = useProfiles()
// Shares the cache with the setup form, which updates it when a key is saved.
const llm = useQuery({ queryKey: ['llm'], queryFn: () => api.getLlmSettings() })
const justConnected = ref(false)
</script>

<template>
  <div
    v-if="llm.data.value && !llm.data.value.hasKey"
    class="mb-10 rounded-lg border border-stone-200 bg-white p-5"
  >
    <p v-if="session.user && !profiles.data.value?.length" class="mb-4 font-serif text-lg">
      Welcome, {{ session.user.name }}. Two quick steps and you're ready to write.
    </p>
    <LlmSettingsSection guide @saved="justConnected = true" />
  </div>
  <p v-else-if="justConnected" role="status" class="mb-6 rounded bg-stone-100 p-3 text-sm">
    Your Anthropic key is saved. The writing assistant is ready to use.
  </p>

  <section aria-labelledby="profiles-heading">
    <div class="mb-6 flex items-center justify-between gap-4">
      <h1 id="profiles-heading" class="font-serif text-2xl font-semibold">Your profiles</h1>
      <RouterLink :to="{ name: 'new-profile' }" class="btn btn-primary">New profile</RouterLink>
    </div>

    <p v-if="profiles.isPending.value">Loading…</p>
    <div
      v-else-if="profiles.isError.value"
      role="alert"
      class="rounded border border-red-200 bg-red-50 p-4"
    >
      <p class="text-red-900">We couldn't load your profiles.</p>
      <button type="button" class="mt-2 text-sm underline" @click="profiles.refetch()">
        Try again
      </button>
    </div>
    <div
      v-else-if="!profiles.data.value?.length"
      class="rounded border border-dashed border-stone-300 p-8 text-center"
    >
      <p class="font-serif text-lg">Next, create your first profile</p>
      <p class="mx-auto mt-2 max-w-md text-stone-700">
        A profile is a place you publish, like a Substack or a blog. It keeps its own ideas, readers
        and drafts together. You can give it a name, a website and a picture, and share it with
        others later.
      </p>
      <RouterLink :to="{ name: 'new-profile' }" class="btn btn-primary mt-4 inline-block">
        Create your first profile
      </RouterLink>
    </div>
    <ul v-else class="grid gap-4 sm:grid-cols-2">
      <li v-for="p in profiles.data.value" :key="p.id">
        <RouterLink
          :to="{ name: 'profile', params: { profileId: p.id } }"
          class="flex h-full items-center gap-4 rounded-lg border border-stone-200 bg-white p-4 hover:border-stone-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ProfileImage :id="p.id" :name="p.name" :image-url="p.imageUrl" />
          <span class="min-w-0">
            <span class="block truncate font-serif text-lg font-semibold">{{ p.name }}</span>
            <span v-if="p.siteUrl" class="block truncate text-sm text-stone-600">
              {{ displayHost(p.siteUrl) }}
            </span>
            <span v-if="p.members.length > 1" class="block text-sm text-stone-600">
              Shared with {{ p.members.length - 1 }}
              {{ p.members.length === 2 ? 'person' : 'people' }}
            </span>
          </span>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>
