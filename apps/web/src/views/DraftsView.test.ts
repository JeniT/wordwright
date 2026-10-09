import { VueQueryPlugin } from '@tanstack/vue-query'
import { render, screen } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createPinia } from 'pinia'
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from '../router'
import DraftsView from './DraftsView.vue'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderView() {
  const router = createRouter({ history: createMemoryHistory(), routes })
  return render(DraftsView, { global: { plugins: [createPinia(), VueQueryPlugin, router] } })
}

describe('DraftsView', () => {
  it('shows an empty state', async () => {
    server.use(http.get('*/api/drafts', () => HttpResponse.json([])))
    renderView()
    await screen.findByText(/Nothing here yet/)
  })

  it('lists drafts', async () => {
    server.use(
      http.get('*/api/drafts', () =>
        HttpResponse.json([
          {
            id: '1',
            title: 'On rivers',
            body: '',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-02T00:00:00Z',
          },
        ]),
      ),
    )
    renderView()
    await screen.findByRole('link', { name: /On rivers/ })
  })
})
