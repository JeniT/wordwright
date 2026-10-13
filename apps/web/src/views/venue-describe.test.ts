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

const POSTS = ['https://garden.example/one', 'https://garden.example/two']
const owner = { userId: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'owner' }
const bare = {
  id: 'ada-venue',
  name: 'Garden notes',
  siteUrl: 'https://garden.example/',
  imageUrl: null,
  description: null,
  descriptionOrigin: 'entered',
  descriptionConfirmed: true,
  descriptionSources: [] as string[],
  descriptionEdited: false,
  role: 'owner',
  members: [owner],
}
const drafted = {
  ...bare,
  description: 'The posts are personal essays about gardens (posts 1 and 2).',
  descriptionOrigin: 'inferred',
  descriptionConfirmed: false,
  descriptionSources: POSTS,
}

/** The server as far as these pages need it, remembering the profile so a save shows on the next read. */
function fakeServer(start: typeof bare | typeof drafted = bare) {
  const state = { profile: { ...start } as Record<string, unknown> }
  const calls: { path: string; body: unknown }[] = []
  server.use(
    signedInAs(testUser),
    http.get('*/api/profiles', () => HttpResponse.json([state.profile])),
    http.get('*/api/profiles/ada-venue/ideas', () => HttpResponse.json([])),
    http.get('*/api/profiles/ada-venue/notes', () => HttpResponse.json([])),
    http.post('*/api/profiles/ada-venue/description/confirm', () => {
      calls.push({ path: 'confirm', body: null })
      state.profile = { ...state.profile, descriptionConfirmed: true }
      return HttpResponse.json(state.profile)
    }),
    http.put('*/api/profiles/ada-venue/description', async ({ request }) => {
      const body = (await request.json()) as { description: string }
      calls.push({ path: 'save', body })
      const fromDraft = state.profile.descriptionOrigin === 'inferred'
      state.profile = {
        ...state.profile,
        description: body.description,
        descriptionConfirmed: true,
        descriptionEdited: fromDraft && body.description !== state.profile.description,
      }
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

describe('describing a venue: an AI draft saved before drafting was removed', () => {
  it('is shown as AI-drafted with its evidence, and needs confirming', async () => {
    const { calls } = fakeServer(drafted)
    const { router } = await renderAt('/p/ada-venue/describe')
    expect(
      await screen.findByRole('heading', { name: 'Read it, change it, then use it' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('About this venue')).toHaveValue(drafted.description)
    expect(screen.getByText('AI draft')).toBeInTheDocument()
    expect(
      screen.getByText(/Drafted by AI from 2 posts\. You have not accepted it yet/),
    ).toBeInTheDocument()
    await fireEvent.click(screen.getByText('The posts it was drawn from'))
    const evidence = within(
      screen.getByText('The posts it was drawn from').closest('details')!,
    ).getAllByRole('link')
    expect(evidence.map((a) => a.getAttribute('href'))).toEqual(POSTS)

    // Using it as it stands confirms it, without changing a word.
    await fireEvent.click(screen.getByRole('button', { name: 'Use this description' }))
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/p/ada-venue'))
    expect(calls.map((c) => c.path)).toEqual(['confirm'])
  })

  it('saves the writer’s changes instead when they edit it first', async () => {
    const { calls } = fakeServer(drafted)
    await renderAt('/p/ada-venue/describe')
    await screen.findByRole('button', { name: 'Use this description' })
    await fireEvent.update(
      screen.getByLabelText('About this venue'),
      'Garden essays. Mine, mostly.',
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Use this description' }))
    await waitFor(() => expect(calls.map((c) => c.path)).toEqual(['save']))
    expect(calls[0]!.body).toEqual({ description: 'Garden essays. Mine, mostly.' })
  })

  it('does not use an emptied draft, and lets the writer leave it unused', async () => {
    const { calls, state } = fakeServer(drafted)
    await renderAt('/p/ada-venue/describe')
    await screen.findByRole('button', { name: 'Use this description' })
    await fireEvent.update(screen.getByLabelText('About this venue'), '  ')
    expect(screen.getByRole('button', { name: 'Use this description' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Not now' })).toHaveAttribute('href', '/p/ada-venue')
    expect(
      screen.getByText(/the draft is kept but the assistant will not see it/),
    ).toBeInTheDocument()
    expect(calls).toEqual([])
    expect(state.profile.descriptionConfirmed).toBe(false)
  })
})

describe('where an AI draft is marked', () => {
  const origin = (over: object) => ({ ...drafted, ...over })

  it('on the profile page: not accepted yet, with a way to review it', async () => {
    fakeServer(drafted)
    await renderAt('/p/ada-venue')
    const about = await screen.findByRole('region', { name: 'About this profile' })
    expect(within(about).getByText('AI draft')).toBeInTheDocument()
    expect(about).toHaveTextContent(
      'You have not accepted it yet, so the assistant does not see it.',
    )
    expect(within(about).getByRole('link', { name: /Read it and decide/ })).toHaveAttribute(
      'href',
      '/p/ada-venue/describe',
    )
  })

  it.each([
    [{ descriptionConfirmed: true }, 'Accepted by you as it was.'],
    [{ descriptionConfirmed: true, descriptionEdited: true }, 'Then edited by you.'],
  ])('says what happened to it after %j', async (over, phrase) => {
    fakeServer(origin(over))
    await renderAt('/p/ada-venue')
    const about = await screen.findByRole('region', { name: 'About this profile' })
    expect(about).toHaveTextContent(phrase)
    expect(within(about).queryByRole('link', { name: /Read it and decide/ })).toBeNull()
  })

  it('not at all for words the writer wrote', async () => {
    fakeServer({ ...bare, description: 'Mine.' })
    await renderAt('/p/ada-venue')
    const about = await screen.findByRole('region', { name: 'About this profile' })
    expect(about).toHaveTextContent('Mine.')
    expect(within(about).queryByText('AI draft')).toBeNull()
  })

  it('in the settings, where saving accepts it', async () => {
    const { calls } = fakeServer(drafted)
    await renderAt('/p/ada-venue/settings')
    expect(await screen.findByText('AI draft')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Use this description' }))
    await screen.findByText(/Accepted by you as it was/)
    expect(calls).toEqual([{ path: 'save', body: { description: drafted.description } }])
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
