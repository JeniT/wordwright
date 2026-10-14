<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import SideMenu from './components/SideMenu.vue'
import VerifyEmailBanner from './components/VerifyEmailBanner.vue'
import { api } from './lib/api'
import { useNav } from './lib/nav'
import { useProfileAddressRedirect, useProfiles } from './lib/useProfiles'
import { useTheme } from './lib/useTheme'
import { useSessionStore } from './stores/session'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()

useProfiles() // loaded once for everything that needs the list (the menu, the home page)
useProfileAddressRedirect()

const nav = useNav()
/** Where you are, for the phone's top bar while the menu is folded: "What the allotment…  02 Notes". */
const here = computed(() => {
  const step = nav.steps.value.find((s) => s.key === nav.stepKey.value)
  return step ? `${step.number} ${step.label}` : ''
})

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
</script>

<template>
  <a
    href="#main"
    class="sr-only z-50 bg-surface px-4 py-2 font-semibold focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
    >Skip to content</a
  >
  <!--
    Signed in: a side menu that follows you (a top bar with a Menu button on phones, and at every width on pages
    read beside another window: nav.compact). Signed out: just the name.
  -->
  <div
    class="min-h-screen"
    :class="
      session.user && !session.user.reviewerOnly && !nav.compact.value
        ? 'md:grid md:grid-cols-[16rem_minmax(0,1fr)]'
        : ''
    "
  >
    <!-- A reviewer-only account has no menu: just its reviews, its name and a way out. -->
    <header
      v-if="session.user?.reviewerOnly"
      class="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-5 py-4"
    >
      <RouterLink to="/reviews" class="flex items-center gap-3 font-semibold no-underline">
        <span
          class="grid size-9 place-items-center rounded-ctl bg-accent text-sm text-on-accent"
          aria-hidden="true"
          >W</span
        >
        <span class="text-lg">Wordwright</span>
      </RouterLink>
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <span>{{ session.user.name }}</span>
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
    </header>
    <header
      v-else-if="session.user"
      class="border-b border-line bg-surface"
      :class="nav.compact.value ? '' : 'md:border-r md:border-b-0'"
    >
      <div
        :class="
          nav.compact.value
            ? ''
            : 'md:sticky md:top-0 md:flex md:h-screen md:flex-col md:overflow-y-auto'
        "
      >
        <div
          class="flex items-center justify-between gap-3 px-5 py-4"
          :class="nav.compact.value ? '' : 'md:py-5'"
        >
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
            class="btn btn-neutral btn-sm"
            :class="nav.compact.value ? '' : 'md:hidden'"
            aria-controls="side-menu"
            :aria-expanded="menuOpen"
            @click="menuOpen = !menuOpen"
          >
            Menu
          </button>
        </div>
        <p
          v-if="!menuOpen && (nav.eyebrow.value || here)"
          class="px-5 pb-3 text-sm break-words"
          :class="nav.compact.value ? '' : 'md:hidden'"
        >
          {{ nav.eyebrow.value }}<template v-if="nav.eyebrow.value && here"> · </template
          ><strong>{{ here }}</strong>
        </p>

        <div
          id="side-menu"
          class="flex-col"
          :class="[menuOpen ? 'flex' : 'hidden', nav.compact.value ? '' : 'md:flex md:flex-1']"
        >
          <SideMenu />

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
