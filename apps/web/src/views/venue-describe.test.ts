import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  llmSettings,
  renderAt,
  server,
  signedInAs,
  sourcesList,
  testUser,
  useMockServer,
} from '../test-utils'

useMockServer()
// jsdom cannot type into the rich-text editor; its own tests are in DescriptionEditor.test.ts.
vi.mock('../components/DescriptionEditor.vue', () => import('../testing/description-editor-stub'))
beforeEach(() => server.use(llmSettings(true), sourcesList()))

const owner = { userId: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'owner' }
const bare = {
  id: 'ada-venue',
  name: 'Garden notes',
  siteUrl: 'https://garden.example/',
  imageUrl: null,
  description: null,
  role: 'owner',
  members: [owner],
}
/** The server as far as these pages need it, remembering the profile so a save shows on the next read. */
function fakeServer(
  start: Omit<typeof bare, 'description'> & { description: string | null } = bare,
) {
  const state = { profile: { ...start } as Record<string, unknown> }
  const calls: { path: string; body: unknown }[] = []
  server.use(
    signedInAs(testUser),
    http.get('*/api/profiles', () => HttpResponse.json([state.profile])),
    http.get('*/api/profiles/ada-venue/ideas', () => HttpResponse.json([])),
    http.get('*/api/profiles/ada-venue/notes', () => HttpResponse.json([])),
    http.put('*/api/profiles/ada-venue/description', async ({ request }) => {
      const body = (await request.json()) as { description: string }
      calls.push({ path: 'save', body })
      state.profile = { ...state.profile, description: body.description }
      return HttpResponse.json(state.profile)
    }),
  )
  return { state, calls }
}

describe('describing a venue: guidance and the box', () => {
  it('costs nothing and sends nothing to anyone, and can be skipped', async () => {
    const { calls } = fakeServer()
    let posted = 0
    server.use(http.post('*/api/*', () => (posted++, HttpResponse.json({}))))
    await renderAt('/p/ada-venue/describe')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Describe this venue' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip for now' })).toHaveAttribute(
      'href',
      '/p/ada-venue',
    )
    expect(screen.queryByText(/Draft from a few posts/)).toBeNull() // writing it is the only way
    expect(posted).toBe(0)
    expect(calls).toEqual([])
  })

  it('opens with guidance on what a description needs, and the box to write it in after it', async () => {
    fakeServer()
    await renderAt('/p/ada-venue/describe')
    const box = await screen.findByLabelText('About this venue')
    const guidance = screen.getByText('What makes a useful description').closest('details')!
    expect(guidance).toHaveAttribute('open')
    for (const topic of [
      'What it is.',
      'What it covers.',
      'Who reads it.',
      'How it is written.',
      'What you want from feedback',
      'An example',
    ]) {
      expect(within(guidance).getByText(topic, { exact: false })).toBeInTheDocument()
    }
    expect(within(guidance).getByText(/never as instructions/)).toBeInTheDocument()
    expect(guidance.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('saves what is written in the box', async () => {
    const { calls } = fakeServer()
    const { router } = await renderAt('/p/ada-venue/describe')
    await screen.findByLabelText('About this venue')
    expect(screen.queryByText(/AI draft/)).toBeNull() // nothing is marked as the AI's
    const save = screen.getByRole('button', { name: 'Save description' })
    expect(save).toBeDisabled() // nothing to save yet
    await fireEvent.update(
      screen.getByLabelText('About this venue'),
      'Personal weeknotes, mostly for me.',
    )
    await fireEvent.click(save)
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/p/ada-venue'))
    expect(calls).toEqual([
      { path: 'save', body: { description: 'Personal weeknotes, mostly for me.' } },
    ])
  })
})

describe('the description in the settings and on the profile page', () => {
  it('has the same guidance in the settings, folded away', async () => {
    fakeServer({ ...bare, description: 'Mine.' })
    await renderAt('/p/ada-venue/settings')
    const guidance = (await screen.findByText('What makes a useful description')).closest(
      'details',
    )!
    expect(guidance).not.toHaveAttribute('open')
    expect(within(guidance).getByText(/Who reads it\./)).toBeInTheDocument()
  })

  it('shows the writer’s words with no mark about where they came from', async () => {
    fakeServer({ ...bare, description: 'Mine.' })
    await renderAt('/p/ada-venue')
    const about = await screen.findByRole('region', { name: 'About this profile' })
    expect(about).toHaveTextContent('Mine.')
    expect(about).not.toHaveTextContent(/AI draft|accepted/i)
  })
})

describe('the new profile form', () => {
  const created = { ...bare, description: null }
  const setUp = () => {
    fakeServer()
    server.use(
      http.get('*/api/profiles', () => HttpResponse.json([])),
      http.post('*/api/profiles', () => HttpResponse.json(created, { status: 201 })),
    )
  }

  it('creates and goes to the profile as before', async () => {
    setUp()
    const { router } = await renderAt('/profiles/new')
    await fireEvent.update(await screen.findByLabelText('Name'), 'Garden notes')
    await fireEvent.click(screen.getByRole('button', { name: 'Create profile' }))
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/p/ada-venue'))
  })

  it('can go on to describe it, which is a choice, not a step in the way', async () => {
    setUp()
    const { router } = await renderAt('/profiles/new')
    await fireEvent.update(await screen.findByLabelText('Name'), 'Garden notes')
    await fireEvent.click(screen.getByRole('button', { name: 'Create and describe it' }))
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/p/ada-venue/describe'))
  })
})
