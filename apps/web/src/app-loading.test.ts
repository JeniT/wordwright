import { VueQueryPlugin } from '@tanstack/vue-query'
import { render, screen } from '@testing-library/vue'
import { createPinia, setActivePinia } from 'pinia'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from './router'
import { server, signedInAs, testUser, useMockServer } from './test-utils'

useMockServer()

// Opening a page by its address: until the first navigation finishes (who is signed in, then the page's code) there is
// nothing to draw, and the page used to show only the footer. See docs/design/accessibility.md.

async function openByAddress(path: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createAppRouter(createMemoryHistory())
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

    const loading = await screen.findByRole('status')
    expect(loading).toHaveTextContent('Loading…')
    expect(screen.getByRole('main')).toContainElement(loading)

    signIn()
    await navigation
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
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
