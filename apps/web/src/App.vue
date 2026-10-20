<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import BrandMark from './components/BrandMark.vue'
import NoticeBar from './components/NoticeBar.vue'
import SettingsButton from './components/SettingsButton.vue'
import SideMenu from './components/SideMenu.vue'
import { api } from './lib/api'
import { useModal } from './lib/modal'
import { useNav } from './lib/nav'
import { usePublicationAddressRedirect, usePublications } from './lib/usePublications'
import ThemeChoice from './components/ThemeChoice.vue'
import { useSessionStore } from './stores/session'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()

usePublications() // loaded once for everything that needs the list (the menu, the home page)
usePublicationAddressRedirect()

const nav = useNav()
/** Where you are, for the phone's top bar while the menu is folded: "What the allotment…  03 Note". */
const here = computed(() => {
  if (nav.level.value === 'account')
    return nav.accountPages.value.find((p) => p.key === nav.stepKey.value)?.label ?? ''
  if (nav.level.value === 'publication-settings')
    return nav.settingsPages.value.find((p) => p.key === nav.stepKey.value)?.label ?? ''
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

// On a phone the menu folds away behind a button and opens as a drawer over the page; moving to another page closes
// it again.
const menuOpen = ref(false)
const menu = ref<HTMLElement | null>(null)
watch(
  () => route.fullPath,
  () => (menuOpen.value = false),
)
// Grown to a laptop window with the drawer open, the menu is simply the column beside the page again.
const wide = typeof window !== 'undefined' ? window.matchMedia?.('(min-width: 768px)') : undefined
const onWide = (e: MediaQueryListEvent) => {
  if (e.matches && !nav.compact.value) menuOpen.value = false
}
wide?.addEventListener?.('change', onWide)
onBeforeUnmount(() => wide?.removeEventListener?.('change', onWide))

useModal({
  open: () => menuOpen.value,
  dialog: menu,
  onEscape: () => (menuOpen.value = false),
  initialFocus: () => menu.value?.querySelector<HTMLElement>('a[href], button'),
})
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
        <BrandMark :height="36" />
        <span class="text-lg">Wordwright</span>
      </RouterLink>
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <span>{{ session.user.name }}</span>
        <RouterLink :to="{ name: 'help' }" class="link">Help</RouterLink>
        <ThemeChoice />
        <RouterLink :to="{ name: 'start-writing' }" class="btn btn-outline btn-sm"
          >Start writing</RouterLink
        >
        <button type="button" class="btn btn-outline btn-sm" @click="signOut.mutate()">
          Sign out
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
            <BrandMark :height="36" />
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
          v-if="nav.eyebrow.value || here"
          class="px-5 pb-3 text-sm break-words"
          :class="nav.compact.value ? '' : 'md:hidden'"
        >
          {{ nav.eyebrow.value }}<template v-if="nav.eyebrow.value && here"> · </template
          ><strong>{{ here }}</strong>
        </p>

        <!-- Pressing outside the drawer closes it; the keyboard has Escape, so the scrim is not a control. -->
        <div
          v-if="menuOpen"
          data-scrim
          aria-hidden="true"
          class="fixed inset-0 z-30 bg-scrim"
          :class="nav.compact.value ? '' : 'md:hidden'"
          @click="menuOpen = false"
        ></div>
        <div
          id="side-menu"
          ref="menu"
          class="flex-col"
          :class="[
            menuOpen
              ? 'drawer fixed inset-y-0 left-0 z-40 flex w-64 max-w-full overflow-y-auto border-r border-line bg-surface'
              : 'hidden',
            nav.compact.value
              ? ''
              : 'md:static md:z-auto md:flex md:w-auto md:flex-1 md:overflow-visible md:border-r-0',
          ]"
          :role="menuOpen ? 'dialog' : undefined"
          :aria-modal="menuOpen ? 'true' : undefined"
          :aria-label="menuOpen ? 'Menu' : undefined"
        >
          <SideMenu />

          <div class="mt-auto border-t border-line px-5 py-4">
            <div class="flex items-center justify-between gap-2">
              <p class="min-w-0 font-semibold break-words">{{ session.user.name }}</p>
              <SettingsButton
                :to="{ name: 'account' }"
                label="Account settings"
                :current="nav.level.value === 'account'"
              />
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-3">
              <button type="button" class="btn btn-outline btn-sm" @click="signOut.mutate()">
                Sign out
              </button>
              <RouterLink :to="{ name: 'help' }" class="link text-sm">Help</RouterLink>
            </div>
          </div>
        </div>
      </div>
    </header>

    <div class="min-w-0">
      <header v-if="!session.user" class="px-4 py-5 text-center">
        <RouterLink
          to="/"
          class="inline-flex flex-col items-center gap-2.5 text-lg font-semibold no-underline"
        >
          <BrandMark :height="48" />
          Wordwright
        </RouterLink>
        <p class="mt-2 text-sm">
          <RouterLink :to="{ name: 'help' }" class="link">Help</RouterLink>
        </p>
      </header>
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
        <template v-else>
          <NoticeBar v-if="session.user" />
          <RouterView />
        </template>
      </main>
    </div>
  </div>
</template>
