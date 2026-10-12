import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useSessionStore } from './stores/session'

declare module 'vue-router' {
  interface RouteMeta {
    /** Pages for signed-out visitors (signed-in users are sent home). */
    guest?: boolean
    /** Pages that work the same whether or not someone is signed in (e.g. emailed links). */
    open?: boolean
    /** Pages that need more room than a column of text (the drafting page has a side column). */
    wide?: boolean
    /** Which level of the app the page belongs to, which decides what the side menu lists (see lib/nav.ts). */
    level?: 'profile' | 'idea'
    /** The numbered step the page belongs to (a key from PROFILE_STEPS or IDEA_STEPS); none for settings. */
    step?: string
    /** For the drafting page: the idea it belongs to is found from the draft, not from the address. */
    ideaFromDraft?: boolean
    /** Pages used beside another window (reading a source): the side menu folds away at every width. */
    compact?: boolean
  }
}

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
  {
    path: '/login',
    name: 'login',
    component: () => import('./views/LoginView.vue'),
    meta: { guest: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('./views/RegisterView.vue'),
    meta: { guest: true },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('./views/ForgotPasswordView.vue'),
    meta: { guest: true },
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: () => import('./views/ResetPasswordView.vue'),
    meta: { guest: true },
  },
  {
    path: '/verify-email',
    name: 'verify-email',
    component: () => import('./views/VerifyEmailView.vue'),
    meta: { open: true },
  },
  {
    path: '/confirm-email-change',
    name: 'confirm-email-change',
    component: () => import('./views/ConfirmEmailChangeView.vue'),
    meta: { open: true },
  },
  {
    path: '/undo-email-change',
    name: 'undo-email-change',
    component: () => import('./views/UndoEmailChangeView.vue'),
    meta: { open: true },
  },
  {
    path: '/decline-invite',
    name: 'decline-invite',
    component: () => import('./views/DeclineInviteView.vue'),
    meta: { open: true },
  },
  {
    path: '/accept-invite',
    name: 'accept-invite',
    component: () => import('./views/AcceptInviteView.vue'),
    meta: { open: true },
  },
  { path: '/account', name: 'account', component: () => import('./views/AccountView.vue') },
  {
    path: '/profiles/new',
    name: 'new-profile',
    component: () => import('./views/NewProfileView.vue'),
  },
  // ——— A profile: its landing page, its four steps (01 Search, 02 Read, 03 Notes, 04 Ideas) and its settings ———
  {
    path: '/p/:profileId',
    name: 'profile',
    component: () => import('./views/ProfileHomeView.vue'),
    props: true,
    meta: { level: 'profile' },
  },
  {
    path: '/p/:profileId/search',
    name: 'search',
    component: () => import('./views/SearchView.vue'),
    props: true,
    meta: { level: 'profile', step: 'search' },
  },
  {
    path: '/p/:profileId/read',
    name: 'read',
    component: () => import('./views/ReadView.vue'),
    props: true,
    meta: { level: 'profile', step: 'read' },
  },
  // Inspiration was split into Search and Read; the old addresses still land on the right one.
  {
    path: '/p/:profileId/inspiration',
    name: 'inspiration',
    redirect: (to) => ({
      name: to.hash === '#reading-list' ? 'read' : 'search',
      params: to.params,
    }),
  },
  {
    path: '/p/:profileId/reading',
    name: 'profile-reading',
    redirect: (to) => ({ name: 'read', params: to.params }),
  },
  {
    path: '/p/:profileId/reading/:linkId',
    name: 'profile-reading-item',
    component: () => import('./views/ReadingView.vue'),
    props: true,
    meta: { level: 'profile', step: 'read', compact: true },
  },
  {
    path: '/p/:profileId/notes',
    name: 'profile-notes',
    component: () => import('./views/ProfileNotesView.vue'),
    props: true,
    meta: { level: 'profile', step: 'notes' },
  },
  {
    path: '/p/:profileId/ideas',
    name: 'profile-ideas',
    component: () => import('./views/ProfileIdeasView.vue'),
    props: true,
    meta: { level: 'profile', step: 'ideas' },
  },
  {
    path: '/p/:profileId/ideas/new',
    name: 'new-idea',
    component: () => import('./views/NewIdeaView.vue'),
    props: true,
    meta: { level: 'profile', step: 'ideas' },
  },
  {
    path: '/p/:profileId/describe',
    name: 'describe-venue',
    component: () => import('./views/VenueDescribeView.vue'),
    props: true,
    meta: { level: 'profile' },
  },
  {
    path: '/p/:profileId/settings',
    name: 'profile-settings',
    component: () => import('./views/ProfileSettingsView.vue'),
    props: true,
    meta: { level: 'profile' },
  },

  // ——— An idea: its landing page, 01 Research, 02 Notes, 03 Refine, 04 Draft, 05 Publish, and its settings ———
  {
    path: '/p/:profileId/ideas/:id',
    name: 'idea',
    component: () => import('./views/IdeaHomeView.vue'),
    props: true,
    meta: { level: 'idea' },
  },
  {
    path: '/p/:profileId/ideas/:id/research',
    name: 'idea-research',
    component: () => import('./views/IdeaResearchView.vue'),
    props: true,
    meta: { level: 'idea', step: 'research' },
  },
  {
    path: '/p/:profileId/ideas/:id/research/find',
    name: 'research',
    component: () => import('./views/ResearchView.vue'),
    props: true,
    meta: { level: 'idea', step: 'research' },
  },
  {
    path: '/p/:profileId/ideas/:id/reading/:linkId',
    name: 'reading',
    component: () => import('./views/ReadingView.vue'),
    props: true,
    meta: { level: 'idea', step: 'research', compact: true },
  },
  {
    path: '/p/:profileId/ideas/:id/notes',
    name: 'idea-notes',
    component: () => import('./views/IdeaNotesView.vue'),
    props: true,
    meta: { level: 'idea', step: 'notes' },
  },
  {
    path: '/p/:profileId/ideas/:id/refine',
    name: 'brainstorm',
    component: () => import('./views/BrainstormView.vue'),
    props: true,
    meta: { level: 'idea', step: 'refine' },
  },
  {
    path: '/p/:profileId/ideas/:id/brainstorm',
    redirect: (to) => ({ name: 'brainstorm', params: to.params, query: to.query }),
  },
  {
    path: '/p/:profileId/ideas/:id/drafts',
    name: 'idea-drafts',
    component: () => import('./views/IdeaDraftsView.vue'),
    props: true,
    meta: { level: 'idea', step: 'draft' },
  },
  {
    path: '/p/:profileId/ideas/:id/publish',
    name: 'idea-publish',
    component: () => import('./views/IdeaPublishView.vue'),
    props: true,
    meta: { level: 'idea', step: 'publish' },
  },
  {
    path: '/p/:profileId/ideas/:id/settings',
    name: 'idea-settings',
    component: () => import('./views/IdeaSettingsView.vue'),
    props: true,
    meta: { level: 'idea' },
  },
  {
    path: '/p/:profileId/drafts/:id',
    name: 'draft',
    component: () => import('./views/EditorView.vue'),
    props: true,
    meta: { wide: true, level: 'idea', step: 'draft', ideaFromDraft: true },
  },
]

export function createAppRouter(history = createWebHistory()) {
  const router = createRouter({
    history,
    routes,
    // A new page starts at the top (a step is its own page now); going back returns to where you were;
    // an address with a #section goes to the section.
    scrollBehavior(to, from, saved) {
      if (saved) return saved
      if (to.hash) return { el: to.hash }
      if (to.path !== from.path) return { top: 0 }
    },
  })

  router.beforeEach(async (to) => {
    const session = useSessionStore()
    await session.load()
    if (session.error) return // can't tell who's signed in; App shows the problem
    if (to.meta.open) return
    const signedIn = !!session.user
    // Reset links work whether or not you happen to be signed in.
    if (to.meta.guest && signedIn && to.name !== 'reset-password') return { name: 'home' }
    if (!to.meta.guest && !signedIn) {
      return { name: 'login', query: to.fullPath === '/' ? {} : { next: to.fullPath } }
    }
  })
  return router
}
