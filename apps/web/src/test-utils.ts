import { VueQueryPlugin } from '@tanstack/vue-query'
import { fireEvent, render, screen, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, type Component } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { afterAll, afterEach, beforeAll, beforeEach, expect } from 'vitest'
import { createAppRouter, routes } from './router'
import type { RouteRecordRaw } from 'vue-router'

export const testUser = {
  id: 'u1',
  handle: 'adalovelace',
  handleChosen: true,
  reviewerOnly: false,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  emailVerified: true,
  hasPassword: true,
  linkedProviders: [] as string[],
  tutorialMode: false,
}

/**
 * Answers every test needs without saying so: pages that always load something. `server.use()` in a test overrides these; resetting restores them.
 */
export const server = setupServer(
  // Only this device is signed in (the account page lists where the person is signed in).
  http.get('*/api/account/sessions', () =>
    HttpResponse.json([
      {
        id: 's-this',
        deviceLabel: 'Safari on macOS',
        lastUsedAt: '2026-10-16T09:30:00.000Z',
        current: true,
      },
    ]),
  ),
  // The default number of critiques a draft gets (the account page shows the setting).
  http.get('*/api/account/critique-settings', () => HttpResponse.json({ rounds: 3 })),
  // Tutorial mode is off unless a test says otherwise (only asked for while it is on).
  http.get('*/api/account/tutorial', () =>
    HttpResponse.json({ on: false, seen: [], answered: false }),
  ),
  // The AI buttons read which provider's key they spend; a key is set unless a test says otherwise.
  http.get('*/api/llm', () =>
    HttpResponse.json({
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      hasKey: true,
      keyHint: '…7890',
    }),
  ),
  // No feeds yet, and so no recent posts.
  http.get('*/api/publications/:publicationId/sources', () => HttpResponse.json([])),
  // An empty reading list (the publication's, which the Read page shows).
  http.get('*/api/publications/:publicationId/reading', () => HttpResponse.json([])),
  // No notes yet, on the publication or on any idea.
  http.get('*/api/publications/:publicationId/notes', () => HttpResponse.json([])),
  http.get('*/api/publications/:publicationId/ideas/:ideaId/notes', () => HttpResponse.json([])),
  // Nothing has been pulled into any draft from notes.
  http.get('*/api/publications/:publicationId/drafts/:draftId/insertions', () =>
    HttpResponse.json([]),
  ),
  // No comments on any draft, and no critique of it either.
  http.get('*/api/publications/:publicationId/drafts/:draftId/comments', () =>
    HttpResponse.json([]),
  ),
  http.get('*/api/publications/:publicationId/drafts/:draftId/critique', () =>
    HttpResponse.json({ round: null, used: 0, allowed: 3 }),
  ),
  // No brainstorming has happened yet, on any idea.
  http.get('*/api/publications/:publicationId/ideas/:ideaId/conversation', () =>
    HttpResponse.json({ messages: [], replyingNow: null }),
  ),
)

/**
 * Call once at the top of a test file. Pages are loaded the first time they are visited, so the first test of a file
 * would pay for importing the app and its page (the editor is large) inside its own timeout, which a busy machine
 * can run past. This loads them first, in a hook with its own, longer, timeout. `warm` names the routes the file
 * visits.
 */
export function useMockServer({ warm = [] }: { warm?: string[] } = {}) {
  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'error' })
    await Promise.all([import('./App.vue'), ...warm.map(loadRoute)])
  })
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

/** Imports the page of the named route (a no-op for a name that is not a lazy page). */
async function loadRoute(name: string) {
  const find = (list: RouteRecordRaw[]): RouteRecordRaw | undefined => {
    for (const r of list) {
      if (r.name === name) return r
      const inside = r.children && find(r.children)
      if (inside) return inside
    }
  }
  const component = find(routes)?.component
  if (typeof component === 'function') await (component as () => Promise<unknown>)()
}

export const signedInAs = (
  user: (Omit<typeof testUser, 'handle'> & { handle: string | null }) | null,
) =>
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

/** A publication's reading list sources, for pages (like publication settings) that list them. */
export const sourcesList = (sources: { id: string; url: string }[] = []) =>
  http.get('*/api/publications/:publicationId/sources', () => HttpResponse.json(sources))

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

/**
 * A note's origin line: what it is, then the person who recorded it as a chip (never "by <name>", which would read
 * as the author of whatever was quoted).
 */
export function expectOrigin(element: HTMLElement, phrase: string, who: string) {
  expect(element).toHaveTextContent(phrase)
  expect(within(element).getByText(who, { exact: true })).toHaveClass('rounded-full')
  expect(element).not.toHaveTextContent(`by ${who}`)
}

/**
 * Shows the up/down arrows of a reorderable list. They show for the whole list while focus is in it, so this puts focus
 * on the first row's hidden Reorder button. Waits for the list to be drawn.
 */
export async function showArrows() {
  const grips = await screen.findAllByRole('button', { name: /^Reorder / })
  grips[0]!.focus()
  await nextTick()
}

/** Opens the row of filters under a list's header (the funnel button), if it is not already open. */
export async function openFilters() {
  const button = await screen.findByRole('button', { name: /^Filter/ })
  if (button.getAttribute('aria-expanded') !== 'true') await fireEvent.click(button)
}
