import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useSessionStore } from './stores/session'

declare module 'vue-router' {
  interface RouteMeta {
    /** Pages for signed-out visitors (signed-in users are sent home). */
    guest?: boolean
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
  { path: '/account', name: 'account', component: () => import('./views/AccountView.vue') },
  {
    path: '/p/:profileId',
    name: 'drafts',
    component: () => import('./views/DraftsView.vue'),
    props: true,
  },
  {
    path: '/p/:profileId/drafts/:id',
    name: 'draft',
    component: () => import('./views/EditorView.vue'),
    props: true,
  },
]

export function createAppRouter(history = createWebHistory()) {
  const router = createRouter({ history, routes })

  router.beforeEach(async (to) => {
    const session = useSessionStore()
    await session.load()
    if (session.error) return // can't tell who's signed in; App shows the problem
    const signedIn = !!session.user
    // Reset links work whether or not you happen to be signed in.
    if (to.meta.guest && signedIn && to.name !== 'reset-password') return { name: 'home' }
    if (!to.meta.guest && !signedIn) {
      return { name: 'login', query: to.fullPath === '/' ? {} : { next: to.fullPath } }
    }
  })
  return router
}
