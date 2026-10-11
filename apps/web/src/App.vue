<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import VerifyEmailBanner from './components/VerifyEmailBanner.vue'
import { api } from './lib/api'
import { useProfileAddressRedirect, useProfiles } from './lib/useProfiles'
import { useTheme } from './lib/useTheme'
import { useSessionStore } from './stores/session'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()

const profiles = useProfiles()
useProfileAddressRedirect()
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

const { dark, toggle: toggleTheme } = useTheme()

// On a phone the menu folds away behind a button; moving to another page closes it again.
const menuOpen = ref(false)
watch(
  () => route.fullPath,
  () => (menuOpen.value = false),
)

function switchProfile(event: Event) {
  const profileId = (event.target as HTMLSelectElement).value
  if (profileId) router.push({ name: 'profile', params: { profileId } })
}
</script>

<template>
  <a
    href="#main"
    class="sr-only z-50 bg-surface px-4 py-2 font-semibold focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
    >Skip to content</a
  >
  <!-- Signed in: a side menu (a top bar with a Menu button on phones). Signed out: just the name. -->
  <div
    class="min-h-screen"
    :class="session.user ? 'md:grid md:grid-cols-[16rem_minmax(0,1fr)]' : ''"
  >
    <header v-if="session.user" class="border-b border-line bg-surface md:border-r md:border-b-0">
      <div class="md:sticky md:top-0 md:flex md:h-screen md:flex-col">
        <div class="flex items-center justify-between gap-3 px-5 py-4 md:py-5">
          <RouterLink to="/" class="flex items-center gap-3 font-semibold no-underline">
            <span
              class="grid size-9 place-items-center rounded-ctl bg-accent text-sm text-on-accent"
              aria-hidden="true"
              >W</span
            >
            <span class="text-lg">Wordwright</span>
          </RouterLink>
          <button
            type="button"
            class="btn btn-neutral btn-sm md:hidden"
            aria-controls="side-menu"
            :aria-expanded="menuOpen"
            @click="menuOpen = !menuOpen"
          >
            Menu
          </button>
        </div>

        <div
          id="side-menu"
          class="flex-col md:flex md:flex-1"
          :class="menuOpen ? 'flex' : 'hidden'"
        >
          <div v-if="profiles.data.value?.length" class="px-4 pb-4">
            <label class="meta mb-1 block" for="profile-switcher">Profile</label>
            <select
              id="profile-switcher"
              class="field"
              :value="currentProfileId"
              @change="switchProfile"
            >
              <option value="" disabled>Choose profile…</option>
              <option v-for="p in profiles.data.value" :key="p.id" :value="p.id">
                {{ p.name }}{{ p.members.length > 1 ? ' (shared)' : '' }}
              </option>
            </select>
          </div>

          <nav class="px-3 pb-3" aria-label="Main">
            <RouterLink
              to="/"
              class="flex min-h-11 items-center rounded-ctl px-3 no-underline hover:bg-sunken aria-[current=page]:bg-accent-wash aria-[current=page]:font-semibold aria-[current=page]:shadow-[inset_3px_0_0_var(--color-accent)]"
              >Your profiles</RouterLink
            >
          </nav>

          <div class="mt-auto border-t border-line p-4">
            <p class="meta">Signed in as</p>
            <RouterLink to="/account" class="link font-semibold">{{
              session.user.name
            }}</RouterLink>
            <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
              <button type="button" class="link" @click="signOut.mutate()">Sign out</button>
              <button
                type="button"
                class="btn btn-quiet btn-sm"
                :aria-pressed="dark"
                aria-label="Dark mode"
                @click="toggleTheme"
              >
                {{ dark ? 'Dark' : 'Light' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>

    <div class="min-w-0">
      <header v-if="!session.user" class="px-4 py-5 text-center">
        <RouterLink to="/" class="text-lg font-semibold no-underline">Wordwright</RouterLink>
      </header>
      <VerifyEmailBanner />
      <main
        id="main"
        class="mx-auto px-4 py-8 md:py-12"
        :class="[route.meta.wide ? 'max-w-6xl' : 'max-w-3xl', session.user ? 'sm:px-8' : '']"
      >
        <div v-if="session.error" role="alert" class="callout callout-danger">
          <p class="font-semibold text-danger">{{ session.error }}</p>
          <p class="mt-1 text-sm">Check your connection, or try again in a moment.</p>
          <button type="button" class="btn btn-danger btn-sm mt-3" @click="reload">
            Try again
          </button>
        </div>
        <RouterView v-else />
      </main>
    </div>
  </div>
</template>
