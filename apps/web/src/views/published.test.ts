import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer({ warm: ['draft'] })

const draft = {
  id: 'd1',
  publicationId: 'p1',
  ideaId: 'i1',
  title: 'Part 1',
  body: 'Some text',
  editorId: 'u1',
  editorName: 'Ada Lovelace',
  version: 1,
  publishedAt: null as string | null,
  publishedUrl: null as string | null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}
const MARKED = '2026-10-14T09:00:00Z'

/** A pretend server for the draft page that remembers the mark, like the real one, and records what it was sent. */
function mockDraft(start: Partial<typeof draft> = {}, viewer: typeof testUser = testUser) {
  const state = { draft: { ...draft, ...start }, sent: [] as unknown[] }
  server.use(
    signedInAs(viewer),
    http.get('*/api/publications', () => HttpResponse.json([])),
    http.get('*/api/publications/p1/drafts/d1/handover', () =>
      HttpResponse.json({
        editorId: 'u1',
        editorName: 'Ada Lovelace',
        offer: null,
        asks: [],
        history: [],
      }),
    ),
    http.get('*/api/publications/p1/ideas/i1', () =>
      HttpResponse.json({
        id: 'i1',
        publicationId: 'p1',
        name: 'An idea',
        notes: '',
        articles: [],
        drafts: [],
        pendingSuggestions: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
    ),
    http.get('*/api/publications/p1/drafts/d1', () => HttpResponse.json(state.draft)),
    http.get('*/api/publications/p1/drafts/d1/critique', () =>
      HttpResponse.json({ round: null, used: 0, allowed: 3 }),
    ),
    http.get('*/api/publications/p1/drafts/d1/comments', () => HttpResponse.json([])),
    http.put('*/api/publications/p1/drafts/d1/published', async ({ request }) => {
      const body = (await request.json()) as { published: boolean; url?: string }
      state.sent.push(body)
      state.draft = {
        ...state.draft,
        publishedAt: body.published ? (state.draft.publishedAt ?? MARKED) : null,
        publishedUrl: body.published ? body.url?.trim() || null : null,
      }
      return HttpResponse.json(state.draft)
    }),
  )
  return state
}
const publishSection = () => screen.findByRole('region', { name: 'Publish' })

describe('marking a draft published, on the Draft page (#311)', () => {
  it('starts with a switch that is off, and no link field and no note', async () => {
    mockDraft()
    await renderAt('/p/p1/drafts/d1')
    const section = await publishSection()
    expect(
      within(section).getByRole('switch', { name: 'I’ve published this draft' }),
    ).not.toBeChecked()
    expect(within(section).queryByLabelText(/Link to the published post/)).toBeNull()
    expect(within(section).queryByRole('status')).toBeNull()
  })

  it('turning it on saves at once, says when it was published, and offers the link field', async () => {
    const state = mockDraft()
    await renderAt('/p/p1/drafts/d1')
    const section = await publishSection()
    await fireEvent.click(
      within(section).getByRole('switch', { name: 'I’ve published this draft' }),
    )
    await waitFor(() => expect(state.sent).toEqual([{ published: true }]))
    const note = await within(section).findByText(/Published/, { selector: '.chip' })
    expect(note).toHaveTextContent('Oct 14, 2026')
    expect(within(section).getByLabelText(/Link to the published post/)).toHaveValue('')
    expect(within(section).queryByRole('link', { name: /View post/ })).toBeNull()
  })

  it('saves a link, which then shows as a link that opens in a new tab', async () => {
    const state = mockDraft({ publishedAt: MARKED })
    await renderAt('/p/p1/drafts/d1')
    const section = await publishSection()
    await fireEvent.update(
      await within(section).findByLabelText(/Link to the published post/),
      ' https://example.com/meanders ',
    )
    await fireEvent.click(within(section).getByRole('button', { name: 'Save link' }))
    await waitFor(() =>
      expect(state.sent).toEqual([{ published: true, url: 'https://example.com/meanders' }]),
    )
    const link = await within(section).findByRole('link', { name: /View post/ })
    expect(link).toHaveAttribute('href', 'https://example.com/meanders')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(await within(section).findByText('Saved')).toBeVisible()
  })

  it('with a saved link shows the chip and View post, hides the form, and edit opens it and returns focus', async () => {
    const state = mockDraft({ publishedAt: MARKED, publishedUrl: 'https://example.com/meanders' })
    await renderAt('/p/p1/drafts/d1')
    const section = await publishSection()
    expect(await within(section).findByRole('link', { name: /View post/ })).toBeVisible()
    expect(within(section).queryByLabelText(/Link to the published post/)).toBeNull()
    expect(section.querySelector('.callout')).toBeNull()
    await fireEvent.click(
      within(section).getByRole('button', { name: 'Edit link to the published post' }),
    )
    const field = await within(section).findByLabelText(/Link to the published post/)
    expect(field).toHaveValue('https://example.com/meanders')
    await waitFor(() => expect(field).toHaveFocus())
    await fireEvent.keyDown(field, { key: 'Escape' })
    await waitFor(() =>
      expect(within(section).queryByLabelText(/Link to the published post/)).toBeNull(),
    )
    await waitFor(() =>
      expect(
        within(section).getByRole('button', { name: 'Edit link to the published post' }),
      ).toHaveFocus(),
    )
    await fireEvent.click(
      within(section).getByRole('button', { name: 'Edit link to the published post' }),
    )
    await fireEvent.update(
      await within(section).findByLabelText(/Link to the published post/),
      'https://example.com/new',
    )
    await fireEvent.click(within(section).getByRole('button', { name: 'Save link' }))
    await waitFor(() =>
      expect(state.sent).toEqual([{ published: true, url: 'https://example.com/new' }]),
    )
    await waitFor(() =>
      expect(within(section).queryByLabelText(/Link to the published post/)).toBeNull(),
    )
  })

  it('turning it off takes the chip and the link away', async () => {
    const state = mockDraft({ publishedAt: MARKED, publishedUrl: 'https://example.com/meanders' })
    await renderAt('/p/p1/drafts/d1')
    const section = await publishSection()
    expect(
      await within(section).findByRole('switch', { name: 'I’ve published this draft' }),
    ).toBeChecked()
    await fireEvent.click(
      within(section).getByRole('switch', { name: 'I’ve published this draft' }),
    )
    await waitFor(() => expect(state.sent).toEqual([{ published: false }]))
    await waitFor(() =>
      expect(within(section).queryByRole('link', { name: /View post/ })).toBeNull(),
    )
  })

  it('says what went wrong and puts the switch back if it could not be saved', async () => {
    mockDraft()
    server.use(
      http.put('*/api/publications/p1/drafts/d1/published', () =>
        HttpResponse.json({ error: 'Only Ada Lovelace can do that.' }, { status: 403 }),
      ),
    )
    await renderAt('/p/p1/drafts/d1')
    const section = await publishSection()
    const flip = within(section).getByRole('switch', { name: 'I’ve published this draft' })
    await fireEvent.click(flip)
    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'Only Ada Lovelace can do that.',
    )
    await waitFor(() => expect(flip).not.toBeChecked())
  })

  it('shows anyone else who reads it that it is published, with the link, and no way to change it', async () => {
    mockDraft(
      {
        editorId: 'u2',
        editorName: 'Bob Jones',
        publishedAt: MARKED,
        publishedUrl: 'https://example.com/meanders',
      },
      testUser,
    )
    await renderAt('/p/p1/drafts/d1')
    const link = await screen.findByRole('link', { name: /View post/ })
    expect(link).toHaveAttribute('href', 'https://example.com/meanders')
    expect(screen.getByText(/Published/, { selector: '.chip' })).toBeVisible()
    expect(screen.queryByRole('switch', { name: 'I’ve published this draft' })).toBeNull()
  })
})
