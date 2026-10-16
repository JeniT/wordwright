import { VueQueryPlugin } from '@tanstack/vue-query'
import { render } from '@testing-library/vue'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'
import Explain from '../components/Explain.vue'
import NoticeBar from '../components/NoticeBar.vue'
import { useSessionStore } from '../stores/session'
import { testUser } from '../test-utils'

/** A page with two explanations, so tests can see that a kind of page is recorded once however many there are. */
const Page = defineComponent(
  () => () =>
    h('div', [
      h(Explain, { label: 'About this page' }, () => 'Why this page.'),
      h(Explain, { label: 'About the button' }, () => 'What the button does.'),
    ]),
)
/** A page that has not opted in to tutorial mode (no `meta.tutorial`), though it has an explanation. */
const Plain = defineComponent(
  () => () => h('div', [h(Explain, { label: 'About plain' }, () => 'Text on a plain page.')]),
)

/** A page with only a page-purpose line, which has no icon. */
const Lone = defineComponent(
  () => () => h('div', [h(Explain, { tutorialOnly: true }, () => 'What this page is for.')]),
)

/**
 * Stands in for the app: the notice bar over a router with pages of each kind (one with tutorial text, one without,
 * and one that is quiet, like the editor), with the person signed in. `Page`'s route is named `explained`.
 */
export async function mountTutorial(
  options: { tutorialMode?: boolean; emailVerified?: boolean; path?: string } = {},
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().set({
    ...testUser,
    tutorialMode: options.tutorialMode ?? true,
    emailVerified: options.emailVerified ?? true,
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/explained', name: 'explained', component: Page, meta: { tutorial: true } },
      { path: '/plain', name: 'plain', component: Plain },
      { path: '/lone', name: 'lone', component: Lone },
      { path: '/quiet', name: 'quiet', component: Page, meta: { tutorial: true, quiet: true } },
    ],
  })
  await router.push(options.path ?? '/explained')
  await router.isReady()
  const Shell = defineComponent(() => () => h('div', [h(NoticeBar), h(RouterView)]))
  const queries = { queryClientConfig: { defaultOptions: { queries: { retry: false } } } }
  const view = render(Shell, { global: { plugins: [pinia, [VueQueryPlugin, queries], router] } })
  return { ...view, router }
}
