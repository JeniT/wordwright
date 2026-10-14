import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer({ warm: ['reviews', 'review', 'review-invite', 'start-writing'] })

const reviewer = { ...testUser, id: 'u9', name: 'Rae', handle: null, reviewerOnly: true }
const summary = (over: object = {}) => ({
  id: 'r1',
  draftTitle: 'Meanders',
  profileName: 'Ada’s writing',
  inviterName: 'Ada Lovelace',
  state: 'open',
  createdAt: '2026-02-01T00:00:00Z',
  ...over,
})
const comment = (over: object = {}) => ({
  id: 'c1',
  byAi: false,
  authorId: 'u9',
  authorName: 'Rae',
  block: 'whole',
  excerpt: '',
  hash: null,
  text: 'Lovely start',
  reason: null,
  resolved: false,
  createdAt: '2026-02-02T00:00:00Z',
  ...over,
})

describe('a reviewer’s landing page', () => {
  it('lists only their reviews, with who asked and where each stands, and no menu', async () => {
    server.use(
      signedInAs(reviewer),
      http.get('*/api/reviews', () =>
        HttpResponse.json([summary(), summary({ id: 'r2', draftTitle: 'Tides', state: 'left' })]),
      ),
    )
    await renderAt('/reviews')
    expect(await screen.findByRole('heading', { name: 'Drafts to review' })).toBeTruthy()
    const list = await screen.findByRole('list', { name: 'Your reviews' })
    expect(within(list).getByRole('link', { name: 'Meanders' })).toHaveAttribute(
      'href',
      '/reviews/r1',
    )
    expect(within(list).getAllByText(/asked by Ada Lovelace/)).toHaveLength(2)
    expect(within(list).getByText('You stopped reviewing')).toBeTruthy()
    // Nothing of the rest of the app is offered.
    expect(screen.queryByRole('link', { name: /Account|Profiles|Ideas/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Start writing' })).toBeTruthy()
  })

  it('says so when there is nothing to review, and when the list cannot be loaded', async () => {
    let fail = true
    server.use(
      signedInAs(reviewer),
      http.get('*/api/reviews', () =>
        fail ? HttpResponse.json({ error: 'no' }, { status: 500 }) : HttpResponse.json([]),
      ),
    )
    await renderAt('/reviews')
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't load your reviews")
    fail = false
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(/Nothing to review yet/)).toBeTruthy()
  })

  it('sends a reviewer-only account away from every other page', async () => {
    server.use(
      signedInAs(reviewer),
      http.get('*/api/reviews', () => HttpResponse.json([])),
    )
    const { router } = await renderAt('/account')
    await waitFor(() => expect(router.currentRoute.value.name).toBe('reviews'))
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('reviews')
  })
})

describe('reading one review', () => {
  const open = (detail: object) =>
    server.use(
      signedInAs(reviewer),
      http.get('*/api/reviews/r1', () => HttpResponse.json(detail)),
    )

  it('shows the draft read-only with only their own comments, and a form to add another', async () => {
    const posted: unknown[] = []
    open({
      ...summary(),
      draft: { title: 'Meanders', body: 'Rivers bend.\n\nThey do.' },
      comments: [comment()],
    })
    server.use(
      http.post('*/api/reviews/r1/comments', async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json(comment({ id: 'c2' }), { status: 201 })
      }),
    )
    await renderAt('/reviews/r1')
    expect(await screen.findByRole('heading', { name: 'Meanders' })).toBeTruthy()
    await waitFor(() =>
      expect(document.querySelector('.ProseMirror')).toHaveAttribute('contenteditable', 'false'),
    )
    expect(screen.getByText('Lovely start')).toBeTruthy()
    expect(screen.getByText(/Only you and the draft's editor will see your comments/)).toBeTruthy()
    await fireEvent.update(screen.getByLabelText('Your comment'), 'Which rivers?')
    await fireEvent.click(screen.getByRole('button', { name: /Add comment|Post|Send/ }))
    await waitFor(() => expect(posted).toEqual([{ block: 'whole', text: 'Which rivers?' }]))
  })

  it('lets them stop reviewing, and goes back to the list', async () => {
    let left = false
    open({ ...summary(), draft: { title: 'Meanders', body: 'x' }, comments: [] })
    server.use(
      http.post('*/api/reviews/r1/leave', () => {
        left = true
        return new HttpResponse(null, { status: 204 })
      }),
      http.get('*/api/reviews', () => HttpResponse.json([summary({ state: 'left' })])),
    )
    const { router } = await renderAt('/reviews/r1')
    await fireEvent.click(await screen.findByRole('button', { name: 'Stop reviewing' }))
    await waitFor(() => expect(router.currentRoute.value.name).toBe('reviews'))
    expect(left).toBe(true)
  })

  it('keeps the comments but not the draft once access has ended', async () => {
    open({ ...summary({ state: 'revoked' }), draft: null, comments: [comment()] })
    await renderAt('/reviews/r1')
    expect(await screen.findByTestId('review-ended')).toHaveTextContent('no longer shared with you')
    expect(screen.getByText('Lovely start')).toBeTruthy()
    expect(document.querySelector('.ProseMirror')).toBeNull()
    expect(screen.queryByLabelText('Your comment')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stop reviewing' })).toBeNull()
  })

  it('says when the review cannot be found', async () => {
    server.use(
      signedInAs(reviewer),
      http.get('*/api/reviews/r1', () =>
        HttpResponse.json({ error: 'Not found' }, { status: 404 }),
      ),
    )
    await renderAt('/reviews/r1')
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't load this draft")
  })
})

describe('following the emailed link', () => {
  const preview = http.post('*/api/review-invitations/preview', () =>
    HttpResponse.json({
      draftTitle: 'Meanders',
      profileName: 'Ada’s writing',
      inviterName: 'Ada Lovelace',
      email: 'rae@example.com',
    }),
  )

  it('tells a new person what is asked and makes a reviewer account from a name and password', async () => {
    let body: unknown
    server.use(
      signedInAs(null),
      preview,
      http.post('*/api/auth/register-reviewer', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(reviewer, { status: 201 })
      }),
      http.get('*/api/reviews', () => HttpResponse.json([summary()])),
    )
    const { router } = await renderAt('/review-invite?token=tok')
    expect(await screen.findByText(/would like your comments on/)).toBeTruthy()
    expect(
      screen.getByText(/that one draft and can write comments on it, and nothing else/),
    ).toBeTruthy()
    await fireEvent.update(screen.getByLabelText('What should we call you?'), 'Rae')
    await fireEvent.update(screen.getByLabelText('Choose a password'), 'a long enough password')
    await fireEvent.click(screen.getByRole('button', { name: 'Read the draft' }))
    await waitFor(() => expect(router.currentRoute.value.name).toBe('reviews'))
    expect(body).toEqual({ token: 'tok', name: 'Rae', password: 'a long enough password' })
  })

  it('lets someone signed in as the invited address accept, and says if it is another account', async () => {
    server.use(
      signedInAs({ ...testUser, email: 'rae@example.com' }),
      preview,
      http.post('*/api/review-invitations/accept', () => HttpResponse.json({ reviewId: 'r1' })),
      http.get('*/api/reviews/r1', () =>
        HttpResponse.json({ ...summary(), draft: null, comments: [] }),
      ),
    )
    const { router } = await renderAt('/review-invite?token=tok')
    await fireEvent.click(await screen.findByRole('button', { name: 'Read the draft' }))
    await waitFor(() => expect(router.currentRoute.value.name).toBe('review'))
  })

  it('names the problem when signed in as someone else', async () => {
    server.use(signedInAs(testUser), preview)
    await renderAt('/review-invite?token=tok')
    expect(await screen.findByRole('alert')).toHaveTextContent('rae@example.com')
  })

  it('declines, optionally stopping invitations, without telling the inviter', async () => {
    let body: unknown
    server.use(
      signedInAs(null),
      preview,
      http.post('*/api/review-invitations/decline', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ok: true })
      }),
    )
    await renderAt('/review-invite?token=tok')
    await fireEvent.click(await screen.findByText('Not for you?'))
    await fireEvent.click(screen.getByLabelText(/Stop invitations from Ada Lovelace/))
    await fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Nothing was sent to Ada Lovelace')
    expect(body).toEqual({ token: 'tok', block: 'sender' })
  })

  it('says when the link is no good', async () => {
    server.use(
      signedInAs(null),
      http.post('*/api/review-invitations/preview', () =>
        HttpResponse.json({ error: 'invalid' }, { status: 400 }),
      ),
    )
    await renderAt('/review-invite?token=old')
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired')
  })
})

describe('starting to write', () => {
  it('chooses a username, becomes a full account and goes home', async () => {
    let sent: unknown
    server.use(
      signedInAs(reviewer),
      http.get('*/api/auth/handle-available', () => HttpResponse.json({ available: true })),
      http.post('*/api/reviews/start-writing', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({
          ...testUser,
          id: 'u9',
          handle: 'raewrites',
          reviewerOnly: false,
        })
      }),
      http.get('*/api/profiles', () => HttpResponse.json([])),
    )
    const { router } = await renderAt('/reviews/start')
    await fireEvent.update(await screen.findByLabelText('Username'), 'raewrites')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start writing' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Start writing' }))
    await waitFor(() => expect(router.currentRoute.value.name).toBe('home'))
    expect(sent).toEqual({ handle: 'raewrites' })
  })
})

describe('asking someone to review a draft', () => {
  const draft = {
    id: 'd1',
    profileId: 'p1',
    ideaId: 'i1',
    title: 'T',
    body: 'Some text',
    editorId: 'u1',
    editorName: 'Ada Lovelace',
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
  function page(role: 'owner' | 'member', editorId = 'u1') {
    const calls: string[] = []
    server.use(
      signedInAs(testUser),
      http.get('*/api/profiles', () =>
        HttpResponse.json([
          {
            id: 'p1',
            name: 'P',
            siteUrl: null,
            imageUrl: null,
            description: null,
            role,
            members: [{ userId: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role }],
          },
        ]),
      ),
      http.get('*/api/profiles/p1/ideas/i1', () =>
        HttpResponse.json({
          id: 'i1',
          profileId: 'p1',
          name: 'I',
          notes: '',
          links: [],
          drafts: [],
          createdAt: 'x',
          updatedAt: 'x',
        }),
      ),
      http.get('*/api/profiles/p1/ideas/i1/notes', () => HttpResponse.json([])),
      http.get('*/api/profiles/p1/drafts/d1', () => HttpResponse.json({ ...draft, editorId })),
      http.get('*/api/profiles/p1/drafts/d1/critique', () =>
        HttpResponse.json({ round: null, used: 0, allowed: 3 }),
      ),
      http.get('*/api/profiles/p1/drafts/d1/comments', () => HttpResponse.json([])),
      http.get('*/api/profiles/p1/drafts/d1/insertions', () => HttpResponse.json([])),
      http.get('*/api/profiles/p1/drafts/d1/handover', () =>
        HttpResponse.json({
          editorId,
          editorName: 'Ada Lovelace',
          offer: null,
          asks: [],
          history: [],
        }),
      ),
      http.get('*/api/profiles/p1/drafts/d1/reviewers', () =>
        HttpResponse.json({
          reviewers: [
            { id: 'v1', name: 'Rae', email: 'rae@example.com', state: 'open', createdAt: 'x' },
          ],
          pending: [{ id: 'i9', email: 'later@example.com', expiresAt: 'x' }],
        }),
      ),
      http.post('*/api/profiles/p1/drafts/d1/reviewers', async ({ request }) => {
        calls.push(`invite ${((await request.json()) as { email: string }).email}`)
        return HttpResponse.json({ ok: true }, { status: 202 })
      }),
      http.delete('*/api/profiles/p1/drafts/d1/reviewers/v1', () => {
        calls.push('end v1')
        return new HttpResponse(null, { status: 204 })
      }),
      http.delete('*/api/profiles/p1/drafts/d1/reviewers/invitations/i9', () => {
        calls.push('withdraw i9')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    return calls
  }

  it('lets the editor invite, end a review and withdraw an invitation', async () => {
    const calls = page('member')
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(await screen.findByText(/Ask someone to review this draft/))
    await fireEvent.update(screen.getByLabelText('Their email address'), 'new@example.com')
    await fireEvent.click(screen.getByRole('button', { name: 'Send the invitation' }))
    expect(await screen.findByText(/If new@example.com can be invited/)).toBeTruthy()
    expect(await screen.findByText(/Rae/)).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: "End Rae's review" }))
    await fireEvent.click(
      screen.getByRole('button', { name: 'Withdraw the invitation to later@example.com' }),
    )
    await waitFor(() => expect(calls).toEqual(['invite new@example.com', 'end v1', 'withdraw i9']))
  })

  it('is for the editor and owners only', async () => {
    page('member', 'u2') // someone else edits, and this person is a plain member
    await renderAt('/p/p1/drafts/d1')
    await screen.findByTestId('read-only')
    expect(screen.queryByText(/Ask someone to review this draft/)).toBeNull()
  })

  it('is offered to an owner who is not the editor', async () => {
    page('owner', 'u2')
    await renderAt('/p/p1/drafts/d1')
    expect(await screen.findByText(/Ask someone to review this draft/)).toBeTruthy()
  })
})
