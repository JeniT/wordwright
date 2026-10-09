import { VueQueryPlugin } from '@tanstack/vue-query'
import { render } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createPinia, setActivePinia } from 'pinia'
import type { Component } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { createAppRouter } from './router'

export const testUser = {
  id: 'u1',
  handle: 'adalovelace',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  emailVerified: true,
  hasPassword: true,
  linkedProviders: [] as string[],
}

/**
 * Answers every test needs without saying so: pages that always load something (the account page
 * shows the brainstorming prompt). `server.use()` in a test overrides these; resetting restores them.
 */
export const server = setupServer(
  http.get('*/api/account/brainstorm-prompt', () =>
    HttpResponse.json({ prompt: 'The default brainstorming prompt.', isDefault: true }),
  ),
)

/** Call once at the top of a test file. */
export function useMockServer() {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  // Every account page loads this section, so tests about something else needn't mock it.
  // A test's own `server.use(...)` goes in front of this and wins.
  beforeEach(() =>
    server.use(
      http.get('*/api/invitations/blocks', () => HttpResponse.json({ all: false, senders: [] })),
    ),
  )
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())
}

export const signedInAs = (user: typeof testUser | null) =>
  http.get('*/api/auth/me', () =>
    user ? HttpResponse.json(user) : HttpResponse.json({ error: 'Not signed in' }, { status: 401 }),
  )

/** The saved AI-provider settings, for pages (like the landing page) that check for a key. */
export const llmSettings = (hasKey: boolean) =>
  http.get('*/api/llm', () =>
    HttpResponse.json({
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      hasKey,
      keyHint: hasKey ? '…7890' : null,
    }),
  )

/** A profile's idea sources, for pages (like profile settings) that list them. */
export const sourcesList = (sources: { id: string; url: string }[] = []) =>
  http.get('*/api/profiles/:profileId/sources', () => HttpResponse.json(sources))

/** Renders `component` inside the real router (with guards), app plugins and a fresh pinia. */
export async function renderAt(path: string, component?: Component) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  const App = (await import('./App.vue')).default
  // No retries: a failing request should show its error state at once, not after backoff.
  const queries = { queryClientConfig: { defaultOptions: { queries: { retry: false } } } }
  const view = render(component ?? App, {
    global: { plugins: [pinia, [VueQueryPlugin, queries], router] },
  })
  return { ...view, router }
}
