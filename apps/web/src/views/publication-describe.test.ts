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
  id: 'ada-publication',
  name: 'Garden notes',
  siteUrl: 'https://garden.example/',
  imageUrl: null,
  siteIconUrl: null,
  description: null,
  role: 'owner',
  members: [owner],
}
/** The server as far as these pages need it, remembering the publication so a save shows on the next read. */
function fakeServer(
  start: Omit<typeof bare, 'description'> & { description: string | null } = bare,
) {
  const state = { publication: { ...start } as Record<string, unknown> }
  const calls: { path: string; body: unknown }[] = []
  server.use(
    signedInAs(testUser),
    http.get('*/api/publications', () => HttpResponse.json([state.publication])),
    http.get('*/api/publications/ada-publication/ideas', () => HttpResponse.json([])),
    http.get('*/api/publications/ada-publication/notes', () => HttpResponse.json([])),
    http.put('*/api/publications/ada-publication/description', async ({ request }) => {
      const body = (await request.json()) as { description: string }
      calls.push({ path: 'save', body })
      state.publication = { ...state.publication, description: body.description }
      return HttpResponse.json(state.publication)
    }),
  )
  return { state, calls }
}

describe('describing a publication: guidance and the box', () => {
  it('costs nothing and sends nothing to anyone, and can be skipped', async () => {
    const { calls } = fakeServer()
    let posted = 0
    server.use(http.post('*/api/*', () => (posted++, HttpResponse.json({}))))
    await renderAt('/p/ada-publication/describe')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Describe this publication' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip for now' })).toHaveAttribute(
      'href',
      '/p/ada-publication',
    )
    expect(screen.queryByText(/Draft from a few posts/)).toBeNull() // writing it is the only way
    expect(posted).toBe(0)
    expect(calls).toEqual([])
  })

  it('opens with guidance on what a description needs, and the box to write it in after it', async () => {
    fakeServer()
    await renderAt('/p/ada-publication/describe')
    const box = await screen.findByLabelText('About this publication')
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
    const { router } = await renderAt('/p/ada-publication/describe')
    await screen.findByLabelText('About this publication')
    expect(screen.queryByText(/AI draft/)).toBeNull() // nothing is marked as the AI's
    const save = screen.getByRole('button', { name: 'Save description' })
    expect(save).toBeDisabled() // nothing to save yet
    await fireEvent.update(
      screen.getByLabelText('About this publication'),
      'Personal weeknotes, mostly for me.',
    )
    await fireEvent.click(save)
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/p/ada-publication'))
    expect(calls).toEqual([
      { path: 'save', body: { description: 'Personal weeknotes, mostly for me.' } },
    ])
  })
})

describe('the description in the settings and on the publication page', () => {
  it('has the same guidance in the settings, folded away', async () => {
    fakeServer({ ...bare, description: 'Mine.' })
    await renderAt('/p/ada-publication/settings')
    const guidance = (await screen.findByText('What makes a useful description')).closest(
      'details',
    )!
    expect(guidance).not.toHaveAttribute('open')
    expect(within(guidance).getByText(/Who reads it\./)).toBeInTheDocument()
  })

  it('shows the writer’s words with no mark about where they came from', async () => {
    fakeServer({ ...bare, description: 'Mine.' })
    await renderAt('/p/ada-publication')
    const about = await screen.findByRole('region', { name: 'About this publication' })
    expect(about).toHaveTextContent('Mine.')
    expect(about).not.toHaveTextContent(/AI draft|accepted/i)
  })
})

describe('the new publication form', () => {
  const created = { ...bare, description: null }
  const setUp = () => {
    fakeServer()
    server.use(
      http.get('*/api/publications', () => HttpResponse.json([])),
      http.post('*/api/publications', () => HttpResponse.json(created, { status: 201 })),
    )
  }

  it('creates and goes to the publication as before', async () => {
    setUp()
    const { router } = await renderAt('/publications/new')
    await fireEvent.update(await screen.findByLabelText('Publication name'), 'Garden notes')
    await fireEvent.click(screen.getByRole('button', { name: 'Create publication' }))
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/p/ada-publication'))
  })

  it('has one way to create, and leaves describing to the publication page', async () => {
    setUp()
    await renderAt('/publications/new')
    await screen.findByLabelText('Publication name')
    expect(screen.queryByRole('button', { name: /describe/i })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Create publication' })).toHaveLength(1)
  })

  it('shows what a publication is and why we ask for the website only in tutorial mode', async () => {
    setUp()
    server.use(signedInAs({ ...testUser, tutorialMode: true }))
    const { router } = await renderAt('/publications/new')
    await screen.findByLabelText('Publication name')
    expect(router.currentRoute.value.name).toBe('new-publication')
    expect(screen.getByText(/keeps its ideas and drafts together/)).toBeVisible()
    expect(screen.getByText(/fetch the site’s icon/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'About the website' })).toBeNull()
  })

  it('keeps the website explanation behind an icon, and the purpose line away, otherwise', async () => {
    setUp()
    await renderAt('/publications/new')
    await screen.findByLabelText('Publication name')
    expect(screen.queryByText(/keeps its ideas and drafts together/)).toBeNull()
    expect(screen.getByRole('button', { name: 'About the website' })).toBeInTheDocument()
  })
})

describe('the publication page after creating', () => {
  it('offers describing as its next step, until it has a description', async () => {
    fakeServer()
    await renderAt('/p/ada-publication')
    const next = await screen.findByRole('navigation', { name: 'Next step' })
    expect(within(next).getByRole('link', { name: /Describe this publication/ })).toHaveAttribute(
      'href',
      '/p/ada-publication/describe',
    )
  })

  it('does not offer it once there is one', async () => {
    fakeServer({ ...bare, description: 'Mine.' })
    await renderAt('/p/ada-publication')
    await screen.findByRole('region', { name: 'About this publication' })
    expect(screen.queryByRole('navigation', { name: 'Next step' })).toBeNull()
  })
})
