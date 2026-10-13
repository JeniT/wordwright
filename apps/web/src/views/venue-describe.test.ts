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
    http.post('*/api/profiles/ada-venue/venue/samples', async ({ request }) => {
      const { urls } = (await request.json()) as { urls: string[] }
      return HttpResponse.json({
        samples: urls.map((url) =>
          url.includes('gone')
            ? { ok: false, url, message: 'We couldn’t read that page. Paste a different link.' }
            : {
                ok: true,
                url,
                title: `Post at ${url}`,
                text: 'Some words about the garden.',
                truncated: false,
              },
        ),
      })
    }),
    http.post('*/api/profiles/ada-venue/venue/description', async ({ request }) => {
      const body = (await request.json()) as { urls: string[] }
      calls.push({ path: 'draft', body })
      state.profile = {
        ...drafted,
        descriptionSources: body.urls.filter((u) => !u.includes('gone')),
      }
      return HttpResponse.json({
        profile: state.profile,
        skipped: body.urls
          .filter((u) => u.includes('gone'))
          .map((url) => ({ url, message: 'We couldn’t read that page. Paste a different link.' })),
      })
    }),
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

const draftingSection = () => screen.getByText('Draft from a few posts').closest('details')!

/** Opens the drafting section, pastes links, reads them, and presses the button that drafts. */
async function draftFrom(links: string[]) {
  await fireEvent.click(await screen.findByText('Draft from a few posts'))
  await fireEvent.update(await screen.findByLabelText('Post links'), links.join('\n'))
  await fireEvent.click(screen.getByRole('button', { name: 'Read these posts' }))
  await screen.findByRole('list', { name: 'Posts read' })
  await fireEvent.click(screen.getByRole('button', { name: 'Draft a description' }))
}

describe('describing a venue: the box, and drafting under it', () => {
  it('says what is sent and costs nothing until a button is pressed, and can be skipped', async () => {
    const { calls } = fakeServer()
    let posted = 0
    server.use(
      http.post('*/api/profiles/ada-venue/venue/*', () => (posted++, HttpResponse.json({}))),
    )
    await renderAt('/p/ada-venue/describe')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Describe this venue' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/the text of the posts you chose goes to your own AI provider/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Nothing is sent before that/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip for now' })).toHaveAttribute(
      'href',
      '/p/ada-venue',
    )
    expect(posted).toBe(0)
    expect(calls).toEqual([])
  })

  it('opens on the box to write in, with drafting from posts folded away under it', async () => {
    fakeServer()
    await renderAt('/p/ada-venue/describe')
    const box = await screen.findByLabelText('About this venue')
    expect(screen.queryByRole('button', { name: 'Write it myself' })).toBeNull()
    const section = draftingSection()
    expect(section).not.toHaveAttribute('open')
    // The box comes first on the page, and the section after it.
    expect(box.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await fireEvent.click(screen.getByText('Draft from a few posts'))
    expect(section).toHaveAttribute('open')
    expect(within(section).getByRole('button', { name: 'Find recent posts' })).toBeInTheDocument()
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

describe('describing a venue: the AI draft', () => {
  it('drafts from the posts, shows it as AI-drafted with its evidence, and needs confirming', async () => {
    const { calls } = fakeServer()
    const { router } = await renderAt('/p/ada-venue/describe')
    // One of the links can't be read: the picker says so, and only the readable posts go on to be drafted from.
    await draftFrom([...POSTS, 'https://gone.example/three'])

    expect(
      await screen.findByRole('heading', { name: 'Read it, change it, then use it' }),
    ).toBeInTheDocument()
    expect(calls).toEqual([{ path: 'draft', body: { urls: POSTS, replace: false } }])
    // The draft is in the box, which has the focus, and the drafting section has folded away.
    await waitFor(() => expect(screen.getByLabelText('About this venue')).toHaveFocus())
    await waitFor(() => expect(draftingSection()).not.toHaveAttribute('open'))
    expect(screen.getByText(/The draft is in the box below/)).toBeInTheDocument()
    expect(screen.getByLabelText('About this venue')).toHaveValue(drafted.description)
    expect(screen.getByText('AI draft')).toBeInTheDocument()
    expect(
      screen.getByText(/Drafted by AI from 2 posts\. You have not accepted it yet/),
    ).toBeInTheDocument()
    // The evidence: the posts it was drawn from, and the one that could not be read.
    await fireEvent.click(screen.getByText('The posts it was drawn from'))
    const evidence = within(
      screen.getByText('The posts it was drawn from').closest('details')!,
    ).getAllByRole('link')
    expect(evidence.map((a) => a.getAttribute('href'))).toEqual(POSTS)

    // Using it as it stands confirms it, without changing a word.
    await fireEvent.click(screen.getByRole('button', { name: 'Use this description' }))
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/p/ada-venue'))
    expect(calls.map((c) => c.path)).toEqual(['draft', 'confirm'])
  })

  it('says which posts the server could not read when it drafts', async () => {
    fakeServer()
    server.use(
      http.post('*/api/profiles/ada-venue/venue/description', () =>
        HttpResponse.json({
          profile: drafted,
          skipped: [{ url: 'https://flaky.example/x', message: 'We couldn’t read that page.' }],
        }),
      ),
    )
    await renderAt('/p/ada-venue/describe')
    await draftFrom(POSTS)
    const note = (
      await screen.findByText(/could not be read, so the draft does not use them/)
    ).closest('div')!
    expect(note).toHaveAttribute('role', 'status')
    expect(note).toHaveTextContent('https://flaky.example/x')
  })

  it('saves the writer’s changes instead when they edit it first', async () => {
    const { calls } = fakeServer()
    await renderAt('/p/ada-venue/describe')
    await draftFrom(POSTS)
    await screen.findByRole('button', { name: 'Use this description' }) // the draft has arrived
    await fireEvent.update(
      screen.getByLabelText('About this venue'),
      'Garden essays. Mine, mostly.',
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Use this description' }))
    await waitFor(() => expect(calls.map((c) => c.path)).toEqual(['draft', 'save']))
    expect(calls[1]!.body).toEqual({ description: 'Garden essays. Mine, mostly.' })
  })

  it('does not use an emptied draft, and lets the writer leave it unused', async () => {
    const { calls, state } = fakeServer()
    await renderAt('/p/ada-venue/describe')
    await draftFrom(POSTS)
    await screen.findByRole('button', { name: 'Use this description' }) // the draft has arrived
    await fireEvent.update(screen.getByLabelText('About this venue'), '  ')
    expect(screen.getByRole('button', { name: 'Use this description' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Not now' })).toHaveAttribute('href', '/p/ada-venue')
    expect(
      screen.getByText(/the draft is kept but the assistant will not see it/),
    ).toBeInTheDocument()
    expect(calls.map((c) => c.path)).toEqual(['draft'])
    expect(state.profile.descriptionConfirmed).toBe(false)
  })

  it('says why when drafting fails, and keeps the links that were chosen', async () => {
    fakeServer()
    server.use(
      http.post('*/api/profiles/ada-venue/venue/description', () =>
        HttpResponse.json(
          { error: 'Add your Anthropic API key in your account settings first.' },
          { status: 409 },
        ),
      ),
    )
    await renderAt('/p/ada-venue/describe')
    await draftFrom(POSTS)
    expect(await screen.findByRole('alert')).toHaveTextContent('Add your Anthropic API key')
    expect(screen.getByLabelText('Post links')).toHaveValue(POSTS.join('\n'))
    expect(screen.getByRole('button', { name: 'Draft a description' })).toBeEnabled() // try again
    expect(screen.queryByRole('heading', { name: 'Read it, change it, then use it' })).toBeNull()
    expect(draftingSection()).toHaveAttribute('open') // still open, to try again
  })

  it('says a draft replaces what is in the box, and replaces a saved description only because it was asked', async () => {
    const { calls } = fakeServer({ ...bare, description: 'My own words.' })
    await renderAt('/p/ada-venue/describe')
    expect(await screen.findByLabelText('About this venue')).toHaveValue('My own words.')
    expect(screen.getByRole('button', { name: 'Save description' })).toBeEnabled()
    expect(screen.queryByText('AI draft')).toBeNull()
    await draftFrom(POSTS)
    await screen.findByText('AI draft')
    expect((calls[0]!.body as { replace: boolean }).replace).toBe(true)
  })

  it('warns that a draft replaces the box only when there is something in it', async () => {
    fakeServer()
    await renderAt('/p/ada-venue/describe')
    const box = await screen.findByLabelText('About this venue')
    expect(screen.queryByText('A draft replaces what is in the box now.')).toBeNull()
    await fireEvent.update(box, 'Half a thought')
    expect(screen.getByText('A draft replaces what is in the box now.')).toBeInTheDocument()
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

  it('in the settings, which link to the flow, where saving accepts it', async () => {
    const { calls } = fakeServer(drafted)
    await renderAt('/p/ada-venue/settings')
    expect(await screen.findByText('AI draft')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Draft it from sample posts' })).toHaveAttribute(
      'href',
      '/p/ada-venue/describe',
    )
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
