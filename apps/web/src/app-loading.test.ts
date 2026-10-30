import { VueQueryPlugin } from '@tanstack/vue-query'
import { render, screen } from '@testing-library/vue'
import { createPinia, setActivePinia } from 'pinia'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { createWebHistory } from 'vue-router'
import { createAppRouter } from './router'
import { server, signedInAs, testUser, useMockServer } from './test-utils'

useMockServer()

// Opening a page by its address: until the first navigation finishes (who is signed in, then the page's code) there is
// nothing to draw, and the page used to show only the footer. See docs/design/accessibility.md.

async function openByAddress(path: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  window.history.replaceState({}, '', path) // the address the browser was opened at
  const router = createAppRouter(createWebHistory())
  const App = (await import('./App.vue')).default
  render(App, { global: { plugins: [pinia, VueQueryPlugin, router] } })
  const navigation = router.push(path) // not awaited: this is the page opening
  return { router, navigation }
}

describe('opening a page by its address', () => {
  it('says it is loading until the first navigation finishes, then shows the page', async () => {
    let signIn!: () => void
    const waiting = new Promise<void>((resolve) => (signIn = resolve))
    server.use(
      http.get('*/api/auth/me', async () => {
        await waiting
        return HttpResponse.json(testUser)
      }),
    )
    const { navigation } = await openByAddress('/account')

    const status = screen.getByRole('status') // there before its words, so screen readers announce them
    expect(await screen.findByText('Loading…')).toBeInTheDocument()
    expect(status).toHaveTextContent('Loading…')
    expect(screen.getByRole('main')).toContainElement(status)

    signIn()
    await navigation
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  })

  it('is as wide as the page it is waiting for, so the page does not jump wider', async () => {
    let signIn!: () => void
    const waiting = new Promise<void>((resolve) => (signIn = resolve))
    server.use(
      http.get('*/api/auth/me', async () => {
        await waiting
        return HttpResponse.json(testUser)
      }),
    )
    await openByAddress('/p/ada-substack/drafts/d1')
    await screen.findByText('Loading…')
    expect(screen.getByRole('main')).toHaveClass('max-w-6xl') // the drafting page is wide
    signIn()
  })

  it('leaves the problem message alone when sign-in cannot be checked', async () => {
    server.use(http.get('*/api/auth/me', () => HttpResponse.error()))
    await openByAddress('/account')

    expect(await screen.findByRole('alert')).toHaveTextContent("can't reach the server")
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  })

  it('does not flash on later navigations', async () => {
    server.use(signedInAs(testUser))
    const { router, navigation } = await openByAddress('/account')
    await navigation
    await screen.findByRole('heading', { level: 1 })

    await router.push('/help')
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  })
})
