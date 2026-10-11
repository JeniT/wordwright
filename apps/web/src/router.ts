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
  {
    path: '/p/:profileId',
    name: 'profile',
    component: () => import('./views/ProfileView.vue'),
    props: true,
  },
  {
    path: '/p/:profileId/settings',
    name: 'profile-settings',
    component: () => import('./views/ProfileSettingsView.vue'),
    props: true,
  },
  {
    path: '/p/:profileId/inspiration',
    name: 'inspiration',
    component: () => import('./views/InspirationView.vue'),
    props: true,
  },
  {
    path: '/p/:profileId/reading',
    name: 'profile-reading',
    component: () => import('./views/ProfileReadingView.vue'),
    props: true,
  },
  {
    path: '/p/:profileId/reading/:linkId',
    name: 'profile-reading-item',
    component: () => import('./views/ReadingView.vue'),
    props: true,
  },
  {
    path: '/p/:profileId/notes',
    name: 'profile-notes',
    component: () => import('./views/ProfileNotesView.vue'),
    props: true,
  },
  {
    path: '/p/:profileId/ideas/new',
    name: 'new-idea',
    component: () => import('./views/NewIdeaView.vue'),
    props: true,
  },
  {
    path: '/p/:profileId/ideas/:id/brainstorm',
    name: 'brainstorm',
    component: () => import('./views/BrainstormView.vue'),
    props: true,
  },
  {
    path: '/p/:profileId/ideas/:id/research',
    name: 'research',
    component: () => import('./views/ResearchView.vue'),
    props: true,
  },
  {
    path: '/p/:profileId/ideas/:id',
    name: 'idea',
    component: () => import('./views/IdeaView.vue'),
    props: true,
  },
  {
    path: '/p/:profileId/ideas/:id/reading/:linkId',
    name: 'reading',
    component: () => import('./views/ReadingView.vue'),
    props: true,
  },
  {
    path: '/p/:profileId/drafts/:id',
    name: 'draft',
    component: () => import('./views/EditorView.vue'),
    props: true,
    meta: { wide: true },
  },
]

export function createAppRouter(history = createWebHistory()) {
  const router = createRouter({ history, routes })

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
