import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import type { Editor } from '@tiptap/vue-3'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer({ warm: ['reviews', 'review', 'review-invite', 'start-writing'] })

const reviewer = { ...testUser, id: 'u9', name: 'Rae', handle: null, reviewerOnly: true }
const summary = (over: object = {}) => ({
  id: 'r1',
  draftTitle: 'Meanders',
  publicationName: 'Ada’s writing',
  inviterName: 'Ada Lovelace',
  state: 'open',
  createdAt: '2026-02-01T00:00:00Z',
  ...over,
})
const comment = (over: object = {}) => ({
  id: 'c1',
  byAi: false,
  reviewId: null,
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
        HttpResponse.json([summary(), summary({ id: 'r2', draftTitle: 'Tides', state: 'ended' })]),
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
    expect(within(list).getByText('You ended this review')).toBeTruthy()
    // Nothing of the rest of the app is offered.
    expect(screen.queryByRole('link', { name: /Account|Publications|Ideas/ })).toBeNull()
    const header = within(screen.getByRole('banner'))
    expect(header.getByRole('button', { name: 'Sign out' })).toBeTruthy()
    // They have no account page, so no settings button; Appearance and the way to upgrade are here instead.
    expect(header.queryByRole('link', { name: /settings/i })).toBeNull()
    expect(header.getByRole('radiogroup', { name: 'Appearance' })).toBeTruthy()
    expect(header.getByRole('link', { name: 'Start writing' })).toHaveAttribute(
      'href',
      '/reviews/start',
    )
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

  it('shows the draft read-only with only their own comments, and an Add comment bar that opens a dialog', async () => {
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
    const panel = screen.getByRole('tabpanel', { name: 'Comments' })
    expect(within(panel).getByText('Lovely start')).toBeTruthy()
    expect(within(panel).getByText('General')).toBeTruthy()
    expect(screen.queryByRole('toolbar')).toBeNull() // reviewers have no toolbar, only the bar
    expect(screen.queryByLabelText('Your comment')).toBeNull() // the form is no longer on the page
    expect(screen.queryByRole('heading', { name: 'Your comments' })).toBeNull() // they sit beside the draft
    expect(screen.getAllByRole('button', { name: 'Add comment' })).toHaveLength(1)
    await fireEvent.click(screen.getByRole('button', { name: 'Add comment' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add comment' })
    // Nothing selected in the snapshot: a general comment.
    expect(within(dialog).getByRole('heading', { name: 'General comment' })).toBeTruthy()
    expect(within(dialog).getByText(/Only you and the draft’s editor will see this/)).toBeTruthy()
    await fireEvent.update(within(dialog).getByLabelText('Your comment'), 'Which rivers?')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Add comment' }))
    await waitFor(() => expect(posted).toEqual([{ block: 'whole', text: 'Which rivers?' }]))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('comments on the paragraph and words selected in the snapshot', async () => {
    const posted: unknown[] = []
    open({
      ...summary(),
      draft: { title: 'Meanders', body: 'Rivers bend.\n\nThey do wander.' },
      comments: [],
    })
    server.use(
      http.post('*/api/reviews/r1/comments', async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json(comment({ id: 'c2' }), { status: 201 })
      }),
    )
    await renderAt('/reviews/r1')
    await waitFor(() =>
      expect(document.querySelector('.ProseMirror')).toHaveAttribute('contenteditable', 'false'),
    )
    const dom = document.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }
    dom.editor.commands.setTextSelection({ from: 15, to: 19 }) // "They" in the second paragraph
    await fireEvent.click(screen.getByRole('button', { name: 'Add comment' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add comment' })
    expect(within(dialog).getByRole('heading', { name: 'Comment on paragraph 2' })).toBeTruthy()
    expect(within(dialog).getByText('“They”')).toBeTruthy()
    await fireEvent.update(within(dialog).getByLabelText('Your comment'), 'Who?')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Add comment' }))
    await waitFor(() => expect(posted).toEqual([{ block: 'b2', text: 'Who?', quote: 'They' }]))
  })

  it('comments on the title as a general comment, with the title selected', async () => {
    const posted: unknown[] = []
    open({
      ...summary(),
      draft: { title: 'Meanders', body: 'Rivers bend.' },
      comments: [],
    })
    server.use(
      http.post('*/api/reviews/r1/comments', async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json(comment({ id: 'c2' }), { status: 201 })
      }),
    )
    await renderAt('/reviews/r1')
    await waitFor(() =>
      expect(document.querySelector('.ProseMirror')).toHaveAttribute('contenteditable', 'false'),
    )
    const dom = document.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }
    dom.editor.commands.setTextSelection({ from: 2, to: 5 })
    await fireEvent.focusIn(screen.getByLabelText('Title'))
    await fireEvent.click(screen.getByRole('button', { name: 'Add comment' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add comment' })
    expect(within(dialog).getByRole('heading', { name: 'General comment' })).toBeTruthy()
    expect(within(dialog).queryByRole('switch')).toBeNull()
    await fireEvent.update(within(dialog).getByLabelText('Your comment'), 'Nice title.')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Add comment' }))
    await waitFor(() => expect(posted).toEqual([{ block: 'whole', text: 'Nice title.' }]))
  })

  it('shows End review under the draft and under the comments while open, and in neither once ended', async () => {
    open({
      ...summary(),
      draft: { title: 'Meanders', body: 'x' },
      comments: [],
    })
    await renderAt('/reviews/r1')
    expect(await screen.findAllByRole('button', { name: 'End review' })).toHaveLength(2)
    expect(
      within(screen.getByRole('tabpanel', { name: 'Comments' })).getByRole('button', {
        name: 'End review',
      }),
    ).toBeTruthy()
  })

  it('says so in the panel when they have not commented yet', async () => {
    open({ ...summary(), draft: { title: 'Meanders', body: 'x' }, comments: [] })
    await renderAt('/reviews/r1')
    expect(
      within(await screen.findByRole('tabpanel', { name: 'Comments' })).getByText(
        /You haven’t commented yet/,
      ),
    ).toBeTruthy()
  })

  it('lets them end the review, which stays on the page, read-only', async () => {
    let state = 'open'
    server.use(
      signedInAs(reviewer),
      http.get('*/api/reviews/r1', () =>
        HttpResponse.json({
          ...summary({ state }),
          draft: { title: 'Meanders', body: 'x' },
          comments: [comment()],
        }),
      ),
      http.post('*/api/reviews/r1/end', () => {
        state = 'ended'
        return new HttpResponse(null, { status: 204 })
      }),
      http.get('*/api/reviews', () => HttpResponse.json([summary({ state })])),
    )
    await renderAt('/reviews/r1')
    await screen.findAllByRole('button', { name: 'End review' })
    expect(screen.queryByText(/snapshot/i)).toBeNull()
    expect(screen.queryByTestId('review-ended')).toBeNull()
    await fireEvent.click(
      within(await screen.findByRole('tabpanel', { name: 'Comments' })).getByRole('button', {
        name: 'End review',
      }),
    )
    expect(await screen.findByTestId('review-ended')).toHaveTextContent(
      'You ended this review. Your comments are kept, but you can’t add more.',
    )
    expect(screen.queryByText(/snapshot/i)).toBeNull()
    // Still there: the draft and the comments, but nothing to add to or end.
    expect(screen.getByText('Lovely start')).toBeTruthy()
    expect(document.querySelector('.ProseMirror')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Add comment' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'End review' })).toBeNull()
  })

  it('keeps the draft and the comments when the editor has closed the review', async () => {
    open({
      ...summary({ state: 'closed' }),
      draft: { title: 'Meanders', body: 'Rivers bend.' },
      comments: [comment()],
    })
    await renderAt('/reviews/r1')
    expect(await screen.findByTestId('review-ended')).toHaveTextContent(
      'This review is closed, so you can’t add comments. Your comments are kept.',
    )
    expect(screen.queryByText(/snapshot/i)).toBeNull()
    expect(screen.getByText('Lovely start')).toBeTruthy()
    expect(await screen.findByText('Rivers bend.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add comment' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'End review' })).toBeNull()
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
      publicationName: 'Ada’s writing',
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
      http.post('*/api/review-invitations/accept', () => HttpResponse.json({ reviewId: 'r1' })),
      http.get('*/api/reviews', () => HttpResponse.json([summary()])),
      http.get('*/api/reviews/r1', () =>
        HttpResponse.json({ ...summary(), draft: null, comments: [] }),
      ),
    )
    const { router } = await renderAt('/review-invite?token=tok')
    expect(await screen.findByText(/would like your comments on/)).toBeTruthy()
    expect(
      screen.getByText(/that one draft and can write comments on it, and nothing else/),
    ).toBeTruthy()
    await fireEvent.update(screen.getByLabelText('What should we call you?'), 'Rae')
    await fireEvent.update(screen.getByLabelText('Choose a password'), 'a long enough password')
    await fireEvent.click(screen.getByRole('button', { name: 'Read the draft' }))
    await waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/reviews/r1'))
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

  it('opens the review at once for someone who has just signed in from the invitation page', async () => {
    server.use(
      signedInAs({ ...testUser, email: 'rae@example.com' }),
      preview,
      http.post('*/api/review-invitations/accept', () => HttpResponse.json({ reviewId: 'r1' })),
      http.get('*/api/reviews/r1', () =>
        HttpResponse.json({ ...summary(), draft: null, comments: [] }),
      ),
    )
    const { router } = await renderAt('/review-invite?token=tok&join=1')
    await waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/reviews/r1'))
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
      http.get('*/api/publications', () => HttpResponse.json([])),
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
    publicationId: 'p1',
    ideaId: 'i1',
    title: 'T',
    body: 'Some text',
    editorId: 'u1',
    editorName: 'Ada Lovelace',
    version: 1,
    publishedAt: null,
    publishedUrl: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
  function page(role: 'owner' | 'member', editorId = 'u1', opts: { empty?: boolean } = {}) {
    const calls: string[] = []
    const names: Record<string, string | null> = {}
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () =>
        HttpResponse.json([
          {
            id: 'p1',
            name: 'P',
            siteUrl: null,
            imageUrl: null,
            siteIconUrl: null,
            description: null,
            role,
            members: [
              { userId: 'u1', name: 'Ada Lovelace', handle: 'ada', email: 'ada@example.com', role },
              {
                userId: 'u2',
                name: 'Bob Jones',
                handle: 'bob',
                email: 'bob@example.com',
                role: 'member',
              },
            ],
          },
        ]),
      ),
      http.get('*/api/publications/p1/ideas/i1', () =>
        HttpResponse.json({
          id: 'i1',
          publicationId: 'p1',
          name: 'I',
          notes: '',
          links: [],
          drafts: [],
          pendingSuggestions: 0,
          createdAt: 'x',
          updatedAt: 'x',
        }),
      ),
      http.get('*/api/publications/p1/ideas/i1/notes', () => HttpResponse.json([])),
      http.get('*/api/publications/p1/drafts/d1', () => HttpResponse.json({ ...draft, editorId })),
      http.get('*/api/publications/p1/drafts/d1/critique', () =>
        HttpResponse.json({ round: null, used: 0, allowed: 3 }),
      ),
      http.get('*/api/publications/p1/drafts/d1/comments', () => HttpResponse.json([])),
      http.get('*/api/publications/p1/drafts/d1/insertions', () => HttpResponse.json([])),
      http.get('*/api/publications/p1/drafts/d1/handover', () =>
        HttpResponse.json({
          editorId,
          editorName: 'Ada Lovelace',
          offer: null,
          asks: [],
          history: [],
        }),
      ),
      http.get('*/api/publications/p1/drafts/d1/reviewers', () =>
        HttpResponse.json(
          opts.empty
            ? { reviewers: [], pending: [], snapshots: [] }
            : {
                reviewers: [
                  {
                    id: 'v1',
                    snapshotId: 's1',
                    name: 'Rae',
                    email: 'rae@example.com',
                    state: 'open',
                    sentAt: '2026-02-01T09:30:00Z',
                    commentCount: 2,
                  },
                  {
                    id: 'v2',
                    snapshotId: 's1',
                    name: 'Sam',
                    email: 'sam@example.com',
                    state: 'ended',
                    sentAt: '2026-02-01T09:30:00Z',
                    commentCount: 1,
                  },
                  {
                    id: 'v3',
                    snapshotId: 's2',
                    name: 'Tom',
                    email: 'tom@example.com',
                    state: 'open',
                    sentAt: '2026-03-01T10:00:00Z',
                    commentCount: 0,
                  },
                ],
                pending: [
                  { id: 'i9', snapshotId: 's1', email: 'later@example.com', expiresAt: 'x' },
                ],
                snapshots: [
                  {
                    id: 's1',
                    sentAt: '2026-02-01T09:30:00Z',
                    name: names['s1'] ?? null,
                    open: 1,
                    ended: 1,
                    closed: 0,
                    pending: 1,
                    comments: 3,
                    unresolved: 3,
                  },
                  {
                    id: 's2',
                    sentAt: '2026-03-01T10:00:00Z',
                    name: names['s2'] ?? null,
                    open: 1,
                    ended: 0,
                    closed: 0,
                    pending: 0,
                    comments: 0,
                    unresolved: 0,
                  },
                ],
              },
        ),
      ),
      http.patch('*/api/publications/p1/drafts/d1/snapshots/:id', async ({ params, request }) => {
        const { name } = (await request.json()) as { name: string }
        names[params.id as string] = name || null
        calls.push(`rename ${params.id} ${JSON.stringify(name)}`)
        return new HttpResponse(null, { status: 204 })
      }),
      http.post('*/api/publications/p1/drafts/d1/snapshots/:id/close', ({ params }) => {
        calls.push(`close request ${params.id}`)
        return HttpResponse.json({ closed: 1 })
      }),
      http.post('*/api/publications/p1/drafts/d1/send-for-review', async ({ request }) => {
        calls.push(`send ${JSON.stringify(await request.json())}`)
        return HttpResponse.json({ ok: true }, { status: 202 })
      }),
      http.post('*/api/publications/p1/drafts/d1/reviewers/close', () => {
        calls.push('close all')
        return HttpResponse.json({ closed: 1 })
      }),
      http.delete('*/api/publications/p1/drafts/d1/reviewers/v1', () => {
        calls.push('close v1')
        return new HttpResponse(null, { status: 204 })
      }),
      http.delete('*/api/publications/p1/drafts/d1/reviewers/invitations/i9', () => {
        calls.push('withdraw i9')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    return calls
  }

  /** Send for review is at the top of the Reviews tab, not among the draft's actions. */
  const openSend = async () => {
    await fireEvent.click(await screen.findByRole('tab', { name: /^Reviews/ }))
    await fireEvent.click(await screen.findByRole('button', { name: /^Send for review/ }))
  }

  it('sends a snapshot from a dialog in the Reviews tab, which closes and leaves the tab showing', async () => {
    const calls = page('member')
    await renderAt('/p/p1/drafts/d1')
    expect(screen.queryByRole('button', { name: /^Send for review/ })).toBeNull() // not until the tab is open
    await openSend()
    const dialog = screen.getByRole('dialog', { name: 'Send for review' })
    expect(screen.getByTestId('snapshot-notice')).toHaveTextContent(
      'Reviewers will read and comment on a snapshot of this draft as it is now.',
    )
    expect(screen.queryByRole('button', { name: 'About sending for review' })).toBeNull()
    expect(dialog).not.toHaveTextContent('We email each one')
    expect(within(dialog).getByRole('button', { name: 'Send for review' })).toBeDisabled() // nobody chosen yet
    await fireEvent.update(
      within(dialog).getByLabelText('Email addresses'),
      'new@example.com, other@example.com\nnew@example.com',
    )
    await fireEvent.click(within(dialog).getByLabelText('Bob Jones'))
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Send for review' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(calls).toEqual([
      'send {"emails":["new@example.com","other@example.com"],"memberIds":["u2"]}',
    ])
    expect(screen.getByRole('tab', { name: /^Reviews/ })).toHaveAttribute('aria-selected', 'true')
  })

  describe('the Reviews tab', () => {
    const openTab = async () => {
      await renderAt('/p/p1/drafts/d1')
      await fireEvent.click(await screen.findByRole('tab', { name: /^Reviews/ }))
      return screen.getByRole('tabpanel', { name: /^Reviews/ })
    }

    it('has no count, and shows the latest review request first, titled by when it was sent', async () => {
      page('member')
      const tab = await openTab()
      expect(screen.getByRole('tab', { name: 'Reviews' })).toBeTruthy()
      expect(await within(tab).findByRole('heading', { level: 3 })).toHaveTextContent(/Mar.*2026/)
      expect(within(tab).getByTestId('review-summary')).toHaveTextContent(
        '0 of 1 reviews complete · 0 comments',
      )
      expect(within(tab).getByText(/Tom/)).toBeTruthy()
      expect(within(tab).queryByText(/Rae/)).toBeNull()
      // No sent date on the reviewer rows, and no explanation of what closing does.
      expect(within(tab).queryByText(/sent/i)).toBeNull()
      expect(within(tab).queryByText(/stays readable/)).toBeNull()
    })

    it('pages back to an earlier request with Previous review and Next review', async () => {
      page('member')
      const tab = await openTab()
      await within(tab).findByText(/Tom/)
      expect(within(tab).getByRole('button', { name: 'Next review' })).toBeDisabled()
      await fireEvent.click(within(tab).getByRole('button', { name: 'Previous review' }))
      expect(within(tab).getByRole('heading', { level: 3 })).toHaveTextContent(/Feb.*2026/)
      // Reviewers reading, finished and yet to answer, over the comments so far.
      expect(within(tab).getByTestId('review-summary')).toHaveTextContent(
        '1 of 3 reviews complete · 3 comments',
      )
      expect(within(tab).getByText(/Reading · 2 comments/)).toBeTruthy()
      expect(within(tab).getByText(/Finished · 1 comment/)).toBeTruthy()
      expect(within(tab).getByText('later@example.com · waiting for a reply')).toBeTruthy()
      expect(within(tab).queryByText(/Tom/)).toBeNull()
      await fireEvent.click(within(tab).getByRole('button', { name: 'Next review' }))
      expect(within(tab).getByRole('heading', { level: 3 })).toHaveTextContent(/Mar.*2026/)
    })

    it('names a request, and a blank name goes back to the date and time', async () => {
      const calls = page('member')
      const tab = await openTab()
      await fireEvent.click(await within(tab).findByRole('button', { name: 'Rename review' }))
      await fireEvent.update(within(tab).getByLabelText('Review name'), 'Final draft')
      await fireEvent.click(within(tab).getByRole('button', { name: 'Save' }))
      await waitFor(() =>
        expect(within(tab).getByRole('heading', { level: 3 })).toHaveTextContent('Final draft'),
      )
      expect(within(tab).getByText(/^Sent .*Mar.*2026/)).toBeTruthy()
      await fireEvent.click(within(tab).getByRole('button', { name: 'Rename review' }))
      await fireEvent.update(within(tab).getByLabelText('Review name'), '  ')
      await fireEvent.click(within(tab).getByRole('button', { name: 'Save' }))
      await waitFor(() =>
        expect(within(tab).getByRole('heading', { level: 3 })).toHaveTextContent(/Mar.*2026/),
      )
      expect(calls).toEqual(['rename s2 "Final draft"', 'rename s2 ""'])
    })

    it('asks before closing one reviewer, naming them and saying it cannot be undone', async () => {
      const calls = page('member')
      const tab = await openTab()
      await fireEvent.click(await within(tab).findByRole('button', { name: 'Previous review' }))
      await fireEvent.click(within(tab).getByRole('button', { name: 'Close review: Rae' }))
      const dialog = screen.getByRole('dialog', { name: 'Close Rae’s review?' })
      expect(dialog).toHaveTextContent(
        'Rae will no longer be able to add comments. This cannot be undone.',
      )
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(calls).toEqual([])
      await fireEvent.click(within(tab).getByRole('button', { name: 'Close review: Rae' }))
      await fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Close review' }),
      )
      await waitFor(() => expect(calls).toEqual(['close v1']))
    })

    it('closes this request’s reviews, or every open one, each after asking', async () => {
      const calls = page('member')
      const tab = await openTab()
      await within(tab).findByText(/Tom/)
      await fireEvent.click(within(tab).getByRole('button', { name: 'Close these reviews' }))
      const these = screen.getByRole('dialog', { name: 'Close these reviews?' })
      expect(these).toHaveTextContent(
        'Reviewers will no longer be able to add comments. This cannot be undone.',
      )
      await fireEvent.click(within(these).getByRole('button', { name: 'Close these reviews' }))
      await fireEvent.click(within(tab).getByRole('button', { name: 'Close all reviews' }))
      const all = screen.getByRole('dialog', { name: 'Close all reviews?' })
      await fireEvent.click(within(all).getByRole('button', { name: 'Close all reviews' }))
      await waitFor(() => expect(calls).toEqual(['close request s2', 'close all']))
    })

    it('offers Close all reviews only when other requests have open reviews too', async () => {
      page('member')
      server.use(
        http.get('*/api/publications/p1/drafts/d1/reviewers', () =>
          HttpResponse.json({
            reviewers: [
              {
                id: 'v1',
                snapshotId: 's1',
                name: 'Rae',
                email: 'rae@example.com',
                state: 'open',
                sentAt: '2026-02-01T00:00:00Z',
                commentCount: 0,
              },
            ],
            pending: [],
            snapshots: [
              {
                id: 's1',
                sentAt: '2026-02-01T00:00:00Z',
                name: null,
                open: 1,
                ended: 0,
                closed: 0,
                pending: 0,
                comments: 0,
                unresolved: 0,
              },
            ],
          }),
        ),
      )
      const tab = await openTab()
      expect(await within(tab).findByRole('button', { name: 'Close these reviews' })).toBeTruthy()
      expect(within(tab).queryByRole('button', { name: 'Close all reviews' })).toBeNull()
    })

    it('says All reviews closed when nobody is left to wait for, and withdraws a waiting invitation', async () => {
      const calls = page('member')
      server.use(
        http.get('*/api/publications/p1/drafts/d1/reviewers', () =>
          HttpResponse.json({
            reviewers: [
              {
                id: 'v1',
                snapshotId: 's1',
                name: 'Rae',
                email: 'rae@example.com',
                state: 'closed',
                sentAt: '2026-02-01T00:00:00Z',
                commentCount: 2,
              },
            ],
            pending: [],
            snapshots: [
              {
                id: 's1',
                sentAt: '2026-02-01T00:00:00Z',
                name: null,
                open: 0,
                ended: 0,
                closed: 1,
                pending: 0,
                comments: 2,
                unresolved: 0,
              },
            ],
          }),
        ),
      )
      const tab = await openTab()
      expect(await within(tab).findByTestId('review-summary')).toHaveTextContent(
        'All reviews closed · 2 comments',
      )
      expect(within(tab).queryByRole('button', { name: /^Close/ })).toBeNull()
      expect(calls).toEqual([])
    })

    it('withdraws an invitation that has not been answered', async () => {
      const calls = page('member')
      const tab = await openTab()
      await fireEvent.click(await within(tab).findByRole('button', { name: 'Previous review' }))
      await fireEvent.click(
        within(tab).getByRole('button', { name: 'Withdraw the invitation to later@example.com' }),
      )
      await waitFor(() => expect(calls).toEqual(['withdraw i9']))
    })
  })

  it('saves words typed a moment ago before the snapshot is made', async () => {
    const calls = page('member')
    server.use(
      http.put('*/api/publications/p1/drafts/d1', async ({ request }) => {
        const input = (await request.json()) as { title: string; body: string; version: number }
        calls.push(`save ${input.title}`)
        return HttpResponse.json({ ...draft, title: input.title, version: input.version + 1 })
      }),
    )
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.update(await screen.findByLabelText('Title'), 'Just typed')
    await openSend()
    const dialog = screen.getByRole('dialog', { name: 'Send for review' })
    await fireEvent.update(within(dialog).getByLabelText('Email addresses'), 'new@example.com')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Send for review' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(calls.slice(0, 2)).toEqual(['save Just typed', expect.stringMatching(/^send /)])
  })

  it('sends nothing, and says why, when the latest words could not be saved first', async () => {
    const calls = page('member')
    server.use(
      http.put('*/api/publications/p1/drafts/d1', () =>
        HttpResponse.json({ error: 'This draft has been saved somewhere else.' }, { status: 409 }),
      ),
    )
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.update(await screen.findByLabelText('Title'), 'Just typed')
    await openSend()
    const dialog = screen.getByRole('dialog', { name: 'Send for review' })
    await fireEvent.update(within(dialog).getByLabelText('Email addresses'), 'new@example.com')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Send for review' }))
    expect(
      await screen.findByText(/Nothing was done, because the draft was saved somewhere else/),
    ).toBeTruthy()
    expect(calls.filter((c) => c.startsWith('send'))).toEqual([])
  })

  it('lets an owner who is not the editor see and close reviews in the tab, but not send', async () => {
    page('owner', 'u2')
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(await screen.findByRole('tab', { name: /^Reviews/ }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Previous review' }))
    expect(await screen.findByRole('button', { name: 'Close review: Rae' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Send for review/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Reviews/ })).toBeNull()
  })

  it('shows the tab with an empty state and the Send button before anything is sent', async () => {
    page('owner', 'u1', { empty: true })
    await renderAt('/p/p1/drafts/d1')
    const tab = await screen.findByRole('tab', { name: /^Reviews/ })
    await fireEvent.click(tab)
    const panel = screen.getByRole('tabpanel', { name: /^Reviews/ })
    expect(await within(panel).findByTestId('no-reviews')).toHaveTextContent(
      'snapshot of this draft',
    )
    expect(within(panel).getByRole('button', { name: 'Send for review' })).toBeTruthy()
  })

  it('shows an owner who is not the editor the empty tab, without the Send button', async () => {
    page('owner', 'u2', { empty: true })
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(await screen.findByRole('tab', { name: /^Reviews/ }))
    const panel = screen.getByRole('tabpanel', { name: /^Reviews/ })
    expect(await within(panel).findByTestId('no-reviews')).toHaveTextContent(
      'Only the draft’s editor',
    )
    expect(within(panel).queryByRole('button', { name: /^Send for review/ })).toBeNull()
  })

  it('says so, with a way to try again, when the reviews cannot be loaded', async () => {
    page('member')
    server.use(
      http.get('*/api/publications/p1/drafts/d1/reviewers', () =>
        HttpResponse.json({ error: 'no' }, { status: 500 }),
      ),
    )
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(await screen.findByRole('tab', { name: /^Reviews/ }))
    const panel = screen.getByRole('tabpanel', { name: /^Reviews/ })
    expect(await within(panel).findByRole('alert')).toHaveTextContent('who is reviewing')
    expect(within(panel).getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('is for the editor and owners only', async () => {
    page('member', 'u2') // someone else edits, and this person is a plain member
    await renderAt('/p/p1/drafts/d1')
    await screen.findByTestId('read-only')
    expect(screen.queryByRole('button', { name: /^Send for review/ })).toBeNull()
    expect(screen.queryByRole('tab', { name: /^Reviews/ })).toBeNull()
  })
})

describe('a member asked to review', () => {
  it('finds the draft on the home page', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([])),
      http.get('*/api/llm', () =>
        HttpResponse.json({
          provider: 'anthropic',
          model: 'claude-sonnet-5-5',
          hasKey: true,
          keyHint: 'sk-ant-api03-AbC...7890',
        }),
      ),
      http.get('*/api/reviews', () =>
        HttpResponse.json([summary(), summary({ id: 'r2', draftTitle: 'Old', state: 'ended' })]),
      ),
    )
    await renderAt('/')
    const heading = await screen.findByRole('heading', { name: 'Drafts to review' })
    const section = heading.closest('section')!
    expect(within(section).getByRole('link', { name: 'Meanders' })).toHaveAttribute(
      'href',
      '/reviews/r1',
    )
    expect(within(section).queryByText('Old')).toBeNull() // only the open ones
  })
})
