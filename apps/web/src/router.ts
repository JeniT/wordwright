import { rememberPublication } from './lib/last-publication'
import { ref } from 'vue'
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
    level?: 'publication' | 'idea' | 'account'
    /** The numbered step the page belongs to (a key from PUBLICATION_STEPS or IDEA_STEPS); none for settings. */
    step?: string
    /** For the drafting page: the idea it belongs to is found from the draft, not from the address. */
    ideaFromDraft?: boolean
    /** Pages used beside another window (reading a source): the side menu folds away at every width. */
    compact?: boolean
    /** The page has tutorial text (#198): visiting it with tutorial mode on counts towards having seen every kind. */
    tutorial?: boolean
    /** Info notices (like the offer to turn tutorial mode off) are held back here, so nothing interrupts writing. */
    quiet?: boolean
  }
}

/** Pages a reviewer-only account may open (the others are open to everyone, or for guests). */
const REVIEWER_PAGES = new Set(['reviews', 'review', 'start-writing'])

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('./views/HomeView.vue'),
    meta: { tutorial: true },
  },
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
  {
    path: '/review-invite',
    name: 'review-invite',
    component: () => import('./views/ReviewInviteView.vue'),
    meta: { open: true },
  },
  // ——— Reviews: the drafts someone was asked to read and comment on. The only pages a reviewer-only account has ———
  { path: '/reviews', name: 'reviews', component: () => import('./views/ReviewsView.vue') },
  {
    path: '/reviews/start',
    name: 'start-writing',
    component: () => import('./views/StartWritingView.vue'),
  },
  {
    path: '/reviews/:id',
    name: 'review',
    component: () => import('./views/ReviewView.vue'),
    props: true,
  },
  { path: '/account', name: 'account', redirect: { name: 'account-details' } },
  ...(
    [
      ['details', 'AccountDetailsView'],
      ['ai', 'AccountAiView'],
      ['display', 'AccountDisplayView'],
      ['security', 'AccountSecurityView'],
      ['download', 'AccountDownloadView'],
      ['delete', 'AccountDeleteView'],
    ] as const
  ).map(([step, view]): RouteRecordRaw => ({
    path: `/account/${step}`,
    name: `account-${step}`,
    component: () => import(`./views/${view}.vue`),
    meta: { level: 'account', step },
  })),
  {
    path: '/publications/new',
    name: 'new-publication',
    component: () => import('./views/NewPublicationView.vue'),
    // A page of the home level: no `level`, so the menu stays the home menu.
    meta: { tutorial: true },
  },
  // ——— A publication: its landing page, its four steps (01 Search, 02 Read, 03 Notes, 04 Ideas) and its settings ———
  {
    path: '/p/:publicationId',
    name: 'publication',
    component: () => import('./views/PublicationHomeView.vue'),
    props: true,
    meta: { level: 'publication', tutorial: true },
  },
  {
    path: '/p/:publicationId/search',
    name: 'search',
    component: () => import('./views/SearchView.vue'),
    props: true,
    meta: { level: 'publication', step: 'search' },
  },
  {
    path: '/p/:publicationId/read',
    name: 'read',
    component: () => import('./views/ReadView.vue'),
    props: true,
    meta: { level: 'publication', step: 'read' },
  },
  // Inspiration was split into Search and Read; the old addresses still land on the right one.
  {
    path: '/p/:publicationId/inspiration',
    name: 'inspiration',
    redirect: (to) => ({
      name: to.hash === '#reading-list' ? 'read' : 'search',
      params: to.params,
    }),
  },
  {
    path: '/p/:publicationId/reading',
    name: 'publication-reading',
    redirect: (to) => ({ name: 'read', params: to.params }),
  },
  {
    path: '/p/:publicationId/reading/:linkId',
    name: 'publication-reading-item',
    component: () => import('./views/ReadingView.vue'),
    props: true,
    meta: { level: 'publication', step: 'read', compact: true },
  },
  {
    path: '/p/:publicationId/notes',
    name: 'publication-notes',
    component: () => import('./views/PublicationNotesView.vue'),
    props: true,
    meta: { level: 'publication', step: 'notes' },
  },
  {
    path: '/p/:publicationId/ideas',
    name: 'publication-ideas',
    component: () => import('./views/PublicationIdeasView.vue'),
    props: true,
    meta: { level: 'publication', step: 'ideas' },
  },
  {
    path: '/p/:publicationId/ideas/new',
    name: 'new-idea',
    component: () => import('./views/NewIdeaView.vue'),
    props: true,
    meta: { level: 'publication', step: 'ideas' },
  },
  {
    path: '/p/:publicationId/describe',
    name: 'describe-publication',
    component: () => import('./views/PublicationDescribeView.vue'),
    props: true,
    meta: { level: 'publication', tutorial: true },
  },
  {
    path: '/p/:publicationId/settings',
    name: 'publication-settings',
    component: () => import('./views/PublicationSettingsView.vue'),
    props: true,
    meta: { level: 'publication' },
  },

  // ——— An idea: its landing page, 01 Research, 02 Notes, 03 Refine, 04 Draft, and its settings ———
  {
    path: '/p/:publicationId/ideas/:id',
    name: 'idea',
    component: () => import('./views/IdeaHomeView.vue'),
    props: true,
    meta: { level: 'idea' },
  },
  {
    path: '/p/:publicationId/ideas/:id/research',
    name: 'idea-research',
    component: () => import('./views/IdeaResearchView.vue'),
    props: true,
    meta: { level: 'idea', step: 'research' },
  },
  {
    path: '/p/:publicationId/ideas/:id/research/find',
    name: 'research',
    component: () => import('./views/ResearchView.vue'),
    props: true,
    meta: { level: 'idea', step: 'research' },
  },
  {
    path: '/p/:publicationId/ideas/:id/reading/:linkId',
    name: 'reading',
    component: () => import('./views/ReadingView.vue'),
    props: true,
    meta: { level: 'idea', step: 'research', compact: true },
  },
  {
    path: '/p/:publicationId/ideas/:id/notes',
    name: 'idea-notes',
    component: () => import('./views/IdeaNotesView.vue'),
    props: true,
    meta: { level: 'idea', step: 'notes' },
  },
  {
    path: '/p/:publicationId/ideas/:id/refine',
    name: 'brainstorm',
    component: () => import('./views/BrainstormView.vue'),
    props: true,
    meta: { level: 'idea', step: 'refine' },
  },
  {
    path: '/p/:publicationId/ideas/:id/brainstorm',
    redirect: (to) => ({ name: 'brainstorm', params: to.params, query: to.query }),
  },
  {
    path: '/p/:publicationId/ideas/:id/drafts',
    name: 'idea-drafts',
    component: () => import('./views/IdeaDraftsView.vue'),
    props: true,
    meta: { level: 'idea', step: 'draft' },
  },
  {
    // Publishing is done to one draft, at the bottom of its page; old links land on the idea's drafts.
    path: '/p/:publicationId/ideas/:id/publish',
    redirect: (to) => ({ name: 'idea-drafts', params: to.params, query: to.query }),
  },
  {
    path: '/p/:publicationId/ideas/:id/settings',
    name: 'idea-settings',
    component: () => import('./views/IdeaSettingsView.vue'),
    props: true,
    meta: { level: 'idea' },
  },
  {
    path: '/p/:publicationId/drafts/:id',
    name: 'draft',
    component: () => import('./views/EditorView.vue'),
    props: true,
    meta: { wide: true, level: 'idea', step: 'draft', ideaFromDraft: true, quiet: true },
  },
  // Help works for everyone, signed in or not (a link from sign-up or an email must open). The catch-all comes last.
  {
    path: '/help',
    name: 'help',
    component: () => import('./views/HelpView.vue'),
    meta: { open: true },
  },
  {
    path: '/help/api-key',
    name: 'help-api-key',
    component: () => import('./views/HelpApiKeyView.vue'),
    meta: { open: true },
  },
  {
    path: '/help/privacy',
    name: 'help-privacy',
    component: () => import('./views/HelpPrivacyView.vue'),
    meta: { open: true },
  },
  {
    path: '/help/ai-settings',
    name: 'help-ai-settings',
    component: () => import('./views/HelpAiSettingsView.vue'),
    meta: { open: true },
  },
  {
    path: '/help/tutorial-mode',
    name: 'help-tutorial-mode',
    component: () => import('./views/HelpTutorialModeView.vue'),
    meta: { open: true },
  },
  {
    path: '/help/description',
    name: 'help-description',
    component: () => import('./views/HelpDescriptionView.vue'),
    meta: { open: true },
  },
  {
    path: '/help/:rest(.*)',
    name: 'help-not-found',
    component: () => import('./views/HelpNotFoundView.vue'),
    meta: { open: true },
  },
]

/**
 * The page the person was on before this one, within this tab (null when they arrived straight here: a new tab, a
 * reload, a link from an email). Help pages use it for "Back".
 */
export const cameFrom = ref<string | null>(null)

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

  router.afterEach((to, from) => {
    // Any page of a publication (an idea, a draft...) counts as working in it, for Home's quick add.
    if (typeof to.params.publicationId === 'string') rememberPublication(to.params.publicationId)
    cameFrom.value = from.matched.length ? from.fullPath : null
  })
  router.beforeEach(async (to) => {
    const session = useSessionStore()
    await session.load()
    if (session.error) return // can't tell who's signed in; App shows the problem
    if (to.meta.open) return
    const signedIn = !!session.user
    // A reviewer-only account has just its reviews (the server answers 404 to the rest, so don't ask for it).
    if (session.user?.reviewerOnly && !REVIEWER_PAGES.has(String(to.name))) {
      return { name: 'reviews' }
    }
    // Reset links work whether or not you happen to be signed in.
    if (to.meta.guest && signedIn && to.name !== 'reset-password') return { name: 'home' }
    if (!to.meta.guest && !signedIn) {
      return { name: 'login', query: to.fullPath === '/' ? {} : { next: to.fullPath } }
    }
  })
  return router
}
