import { VueQueryPlugin } from '@tanstack/vue-query'
import { render } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createPinia, setActivePinia } from 'pinia'
import type { Component } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { createAppRouter } from './router'

export const testUser = {
  id: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  emailVerified: true,
  hasPassword: true,
  linkedProviders: [] as string[],
}

export const server = setupServer()

/** Call once at the top of a test file. */
export function useMockServer() {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())
}

export const signedInAs = (user: typeof testUser | null) =>
  http.get('*/api/auth/me', () =>
    user ? HttpResponse.json(user) : HttpResponse.json({ error: 'Not signed in' }, { status: 401 }),
  )

/** Renders `component` inside the real router (with guards), app plugins and a fresh pinia. */
export async function renderAt(path: string, component?: Component) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  const App = (await import('./App.vue')).default
  const view = render(component ?? App, { global: { plugins: [pinia, VueQueryPlugin, router] } })
  return { ...view, router }
}
