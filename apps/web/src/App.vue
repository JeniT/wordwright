<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import VerifyEmailBanner from './components/VerifyEmailBanner.vue'
import { api } from './lib/api'
import { useProfiles } from './lib/useProfiles'
import { useSessionStore } from './stores/session'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()

const profiles = useProfiles()
const currentProfileId = computed(() => (route.params.profileId as string | undefined) ?? '')

const signOut = useMutation({
  mutationFn: () => api.logout(),
  onSuccess: async () => {
    session.set(null)
    queryClient.clear()
    await router.push('/login')
  },
})

const reload = () => window.location.reload()

function switchProfile(event: Event) {
  const profileId = (event.target as HTMLSelectElement).value
  if (profileId) router.push({ name: 'profile', params: { profileId } })
}
</script>

<template>
  <div class="min-h-screen">
    <header class="border-b border-stone-200 bg-white/60">
      <nav
        class="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3"
        aria-label="Main"
      >
        <RouterLink to="/" class="font-serif text-lg font-semibold text-accent">
          Long-form Writing Assistant
        </RouterLink>

        <div v-if="session.user" class="flex items-center gap-3 text-sm">
          <label class="sr-only" for="profile-switcher">Profile</label>
          <select
            v-if="profiles.data.value?.length"
            id="profile-switcher"
            class="rounded border border-stone-300 bg-white px-2 py-1"
            :value="currentProfileId"
            @change="switchProfile"
          >
            <option value="" disabled>Choose profile…</option>
            <option v-for="p in profiles.data.value" :key="p.id" :value="p.id">
              {{ p.name }}{{ p.members.length > 1 ? ' (shared)' : '' }}
            </option>
          </select>
          <RouterLink to="/account" class="underline">{{ session.user.name }}</RouterLink>
          <button type="button" class="underline" @click="signOut.mutate()">Sign out</button>
        </div>
      </nav>
    </header>
    <VerifyEmailBanner />
    <main class="mx-auto max-w-3xl px-4 py-8">
      <div v-if="session.error" role="alert" class="rounded border border-red-200 bg-red-50 p-4">
        <p class="font-medium text-red-900">{{ session.error }}</p>
        <p class="mt-1 text-sm">Check your connection, or try again in a moment.</p>
        <button
          type="button"
          class="mt-3 rounded border border-red-700 px-3 py-1 text-sm text-red-900"
          @click="reload"
        >
          Try again
        </button>
      </div>
      <RouterView v-else />
    </main>
  </div>
</template>
