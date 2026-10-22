import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import type { Editor } from '@tiptap/vue-3'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { blockHash } from '@wordwright/core'
import { NOTE_DRAG_TYPE, READING_DRAG_TYPE } from '../lib/note-drag'
import { expectNoLoneInfoIcons } from '../testing/info-icons'
import { renderAt, server, signedInAs, testUser, useMockServer, expectOrigin } from '../test-utils'

useMockServer({ warm: ['draft'] })

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

/** The critique the server has kept for the draft (null: none yet), and what a new request answers. */
function mockEditor(
  critique: () => Response | Promise<Response>,
  latest: ({ points?: object[] } & object) | null = null,
  looks: { used: number; allowed: number } = { used: latest ? 1 : 0, allowed: 3 },
  /** Who is looking: the draft's editor (u1) unless a test says otherwise. */
  viewer: typeof testUser = testUser,
) {
  // The points of a round are comments, kept apart from it, as the server keeps them.
  const split = (r: ({ points?: object[] } & object) | null) => {
    const { points = [], ...rest } = (r ?? {}) as { points?: object[] }
    return { round: r ? rest : null, points }
  }
  const state = { comments: split(latest).points as object[] }
  server.use(
    signedInAs(viewer),
    http.get('*/api/publications', () => HttpResponse.json([])),
    http.get('*/api/publications/p1/drafts/d1/handover', () =>
      HttpResponse.json({
        editorId: draft.editorId,
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
        links: [],
        drafts: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
    ),
    http.get('*/api/publications/p1/drafts/d1', () => HttpResponse.json(draft)),
    http.put('*/api/publications/p1/drafts/d1', () => HttpResponse.json(draft)),
    http.get('*/api/publications/p1/drafts/d1/critique', () =>
      HttpResponse.json({ round: split(latest).round, ...looks }),
    ),
    http.get('*/api/publications/p1/drafts/d1/comments', () => HttpResponse.json(state.comments)),
    http.post('*/api/publications/p1/assist/critique', async () => {
      const res = await critique()
      if (!res.ok) return res
      const made = (await res.json()) as { round: { points?: object[] } | null }
      const { round, points } = split(made.round)
      state.comments = points
      return HttpResponse.json({ ...made, round })
    }),
  )
  return state
}

const round = (points: object[], extra: object = {}) => ({
  id: 'r1',
  createdAt: '2026-01-02T00:00:00Z',
  summary: 'A decent start.',
  ready: false,
  points,
  ...extra,
})
const pointOn = (id: string, over: object = {}) => ({
  id,
  block: 'b1',
  excerpt: 'Some text',
  hash: blockHash('Some text'),
  byAi: true,
  reviewId: null,
  authorId: null,
  authorName: null,
  text: 'Tighten the opening.',
  reason: 'Readers skim.',
  resolved: false,
  createdAt: '2026-01-02T00:00:00Z',
  ...over,
})
/** A comment from a person. */
const saidBy = (id: string, name: string, over: object = {}) =>
  pointOn(id, {
    byAi: false,
    reviewId: null,
    authorId: name === 'Ada Lovelace' ? 'u1' : `u-${name}`,
    authorName: name,
    reason: null,
    text: `${name} on the opening.`,
    ...over,
  })
/** What the server answers about a draft's critiques. */
const state = (r: object | null, used = 1, allowed = 3) => ({ round: r, used, allowed })
/** Shows one of the tabs beside the draft (notes, reading list, comments). */
const showTab = async (name: string) =>
  fireEvent.click(await screen.findByRole('tab', { name: new RegExp(`^${name}`) }))
const commentsRegion = async () => screen.findByRole('region', { name: 'Comments' })

describe('EditorView critique', () => {
  it('points users without an API key to their account settings', async () => {
    mockEditor(() =>
      HttpResponse.json(
        { error: 'Add your Anthropic API key in your account settings to use this feature' },
        { status: 409 },
      ),
    )
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(await screen.findByRole('button', { name: 'Critique' }))
    await screen.findByRole('alert')
    await screen.findByText('Your AI needs your key first.', { exact: false })
    await screen.findByRole('link', { name: 'Add your AI key' })
  })

  it('shows the critique when it works, and marks the paragraph a point is about', async () => {
    mockEditor(() =>
      HttpResponse.json(
        state(
          round([
            pointOn('p1'),
            pointOn('p2', { block: 'whole', excerpt: '', hash: null, text: 'The order is odd.' }),
          ]),
        ),
      ),
    )
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(await screen.findByRole('button', { name: 'Critique' }))
    await screen.findByText('A decent start.')
    const points = within(await commentsRegion()).getAllByRole('listitem')
    expect(points[0]).not.toHaveTextContent('Some text') // no excerpt: the paragraph is on the page
    expect(points[0]).toHaveTextContent('Tighten the opening.')
    expect(points[0]).toHaveTextContent('Readers skim.')
    expect(points[1]).toHaveTextContent('General')
    expect(points[1]!.querySelector('.chip-quiet')).not.toBeNull()
    expect(points[1]).toHaveTextContent('The order is odd.')
    // Only the paragraph point is marked, in the text; the whole-piece point has no paragraph to mark.
    expect(await screen.findAllByRole('button', { name: /^Comment \d/ })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Comment 1' })).toBeTruthy()
  })

  it('underlines the selected words of a comment, where the paragraph still has them', async () => {
    mockEditor(
      () => new Response(null, { status: 500 }),
      round([
        saidBy('c1', 'Ada Lovelace', { quote: 'ome te' }),
        saidBy('c2', 'Ada Lovelace', { quote: 'words that are gone' }),
      ]),
    )
    await renderAt('/p/p1/drafts/d1')
    await waitFor(() => expect(document.querySelectorAll('.comment-quote')).toHaveLength(1))
    expect(document.querySelector('.comment-quote')).toHaveTextContent('ome te')
    // The other comment still marks its paragraph, as before.
    expect(await screen.findByRole('button', { name: 'Comment 2' })).toBeTruthy()
  })

  it('shows the critique kept from last time, without asking for another', async () => {
    mockEditor(() => new Response(null, { status: 500 }), round([pointOn('p1')]))
    await renderAt('/p/p1/drafts/d1')
    await screen.findByText('A decent start.')
    await screen.findByRole('button', { name: 'Comment 1' })
  })

  it('opens the comment when its mark in the text is pressed', async () => {
    mockEditor(() => new Response(null, { status: 500 }), round([pointOn('p1')]))
    await renderAt('/p/p1/drafts/d1')
    // Comments is not the tab showing until something asks for it.
    expect(await screen.findByRole('tab', { name: /^Notes/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await fireEvent.click(await screen.findByRole('button', { name: 'Comment 1' }))
    expect(screen.getByRole('tab', { name: /^Comments/ })).toHaveAttribute('aria-selected', 'true')
    const comment = await within(await commentsRegion()).findByRole('button', {
      name: /Tighten the opening/,
    })
    await waitFor(() => expect(comment).toHaveAttribute('aria-current', 'true'))
    await waitFor(() => expect(comment).toHaveFocus())
    // The mark is drawn again to show it is the one being looked at.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Comment 1' })).toHaveAttribute(
        'aria-current',
        'true',
      ),
    )
  })

  it('shows the paragraph in the draft when a comment is pressed, with no separate button for it', async () => {
    mockEditor(() => new Response(null, { status: 500 }), round([pointOn('p1')]))
    await renderAt('/p/p1/drafts/d1')
    await showTab('Comments')
    expect(screen.queryByRole('button', { name: /Show in draft/ })).toBeNull()
    await fireEvent.click(await screen.findByRole('button', { name: /Tighten the opening/ }))
    await waitFor(() => expect(document.querySelector('.ProseMirror')).toHaveFocus())
    expect(document.querySelector('.comment-block.is-active')).not.toBeNull()
  })

  it('scrolls the paragraph to the top of the page and the comment to the top of its area when a comment is pressed', async () => {
    const pageScroll = vi.fn()
    vi.stubGlobal('scrollTo', pageScroll)
    const areaScroll = vi.fn()
    Element.prototype.scrollTo = areaScroll as never
    mockEditor(() => new Response(null, { status: 500 }), round([pointOn('p1')]))
    await renderAt('/p/p1/drafts/d1')
    await showTab('Comments')
    await fireEvent.click(await screen.findByRole('button', { name: /Tighten the opening/ }))
    await waitFor(() => expect(pageScroll).toHaveBeenCalled())
    expect(areaScroll).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('does the same when a mark in the text is pressed', async () => {
    const pageScroll = vi.fn()
    vi.stubGlobal('scrollTo', pageScroll)
    const areaScroll = vi.fn()
    Element.prototype.scrollTo = areaScroll as never
    mockEditor(() => new Response(null, { status: 500 }), round([pointOn('p1')]))
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(await screen.findByRole('button', { name: 'Comment 1' }))
    await waitFor(() => expect(pageScroll).toHaveBeenCalled())
    await waitFor(() => expect(areaScroll).toHaveBeenCalled())
    vi.unstubAllGlobals()
  })

  it('shows no count on the Comments tab, so the tab bar never wraps', async () => {
    mockEditor(() => new Response(null, { status: 500 }), round([pointOn('p1'), pointOn('p2')]))
    await renderAt('/p/p1/drafts/d1')
    expect(await screen.findByRole('tab', { name: 'Comments' })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: /Comments, / })).toBeNull()
  })

  it('shows the Comments tab as soon as a critique is asked for, with the wait in it', async () => {
    mockEditor(() => HttpResponse.json(state(round([pointOn('p1')]))), null, {
      used: 0,
      allowed: 3,
    })
    await renderAt('/p/p1/drafts/d1')
    expect(await screen.findByRole('tab', { name: /^Notes/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Critique' }))
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /^Comments/ })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
    await screen.findByText('A decent start.')
  })

  it('lists a point whose paragraph has been rewritten apart, without a mark', async () => {
    mockEditor(
      () => new Response(null, { status: 500 }),
      round([
        pointOn('p1'),
        pointOn('p2', {
          hash: blockHash('A paragraph that is not in the draft any more.'),
          excerpt: 'A paragraph that is not in the draft any more.',
          text: 'This one is gone.',
        }),
      ]),
    )
    await renderAt('/p/p1/drafts/d1')
    await screen.findByRole('button', { name: 'Comment 1' })
    await showTab('Comments')
    const region = await commentsRegion()
    await within(region).findByRole('heading', { name: 'This passage has changed' })
    expect(screen.queryByRole('button', { name: 'Comment 2' })).toBeNull()
    expect(region).toHaveTextContent('This one is gone.')
  })

  it('resolves a comment, which takes its mark away and hides it, and shows it again on request', async () => {
    const sent: boolean[] = []
    let comments = [pointOn('p1'), pointOn('p2')]
    mockEditor(() => new Response(null, { status: 500 }), round(comments))
    server.use(
      http.get('*/api/publications/p1/drafts/d1/comments', () => HttpResponse.json(comments)),
      http.put('*/api/publications/p1/drafts/d1/comments/p1', async ({ request }) => {
        const { resolved } = (await request.json()) as { resolved: boolean }
        sent.push(resolved)
        comments = [pointOn('p1', { resolved }), pointOn('p2')]
        return HttpResponse.json(comments)
      }),
    )
    await renderAt('/p/p1/drafts/d1')
    await showTab('Comments')
    const resolve = await screen.findByRole('switch', { name: 'Resolved: comment 1' })
    expect(resolve).not.toBeChecked()
    await fireEvent.click(resolve)
    // Its mark is gone and the comment is hidden rather than deleted.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Comment 1' })).toBeNull())
    expect(screen.getByRole('button', { name: 'Comment 2' })).toBeTruthy()
    expect(within(await commentsRegion()).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.queryByText('Resolved: comment 1')).toBeNull()

    const show = screen.getByRole('switch', { name: 'Show resolved (1)' })
    await fireEvent.click(show)
    const items = within(await commentsRegion()).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Tighten the opening.') // keeps its place and number
    expect(screen.queryByRole('button', { name: 'Comment 1' })).toBeNull() // still no mark in the text
    // A resolved comment still shows its paragraph.
    await fireEvent.click(within(items[0]!).getByRole('button', { name: /Tighten the opening/ }))
    await waitFor(() => expect(document.querySelector('.ProseMirror')).toHaveFocus())

    await fireEvent.click(screen.getByRole('switch', { name: 'Resolved: comment 1' }))
    await screen.findByRole('button', { name: 'Comment 1' })
    expect(sent).toEqual([true, false])
  })

  it('puts the switch back, and says so, when Resolved could not be saved', async () => {
    mockEditor(() => new Response(null, { status: 500 }), round([pointOn('p1')]))
    server.use(
      http.put('*/api/publications/p1/drafts/d1/comments/p1', () =>
        HttpResponse.json({ error: 'The server is having a bad day' }, { status: 500 }),
      ),
    )
    await renderAt('/p/p1/drafts/d1')
    await showTab('Comments')
    await fireEvent.click(await screen.findByRole('switch', { name: 'Resolved: comment 1' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t save that/i)
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Resolved: comment 1' })).not.toBeChecked(),
    )
    expect(screen.getByRole('button', { name: 'Comment 1' })).toBeTruthy() // still marked
  })

  it('has the switch on comments about the whole draft and about a rewritten passage too', async () => {
    mockEditor(
      () => new Response(null, { status: 500 }),
      round([
        pointOn('p1'),
        pointOn('p2', { block: 'whole', excerpt: '', hash: null, text: 'The order is odd.' }),
        pointOn('p3', {
          hash: blockHash('A paragraph that is not in the draft any more.'),
          excerpt: 'A paragraph that is not in the draft any more.',
          text: 'This one is gone.',
        }),
      ]),
    )
    await renderAt('/p/p1/drafts/d1')
    await showTab('Comments')
    for (const n of [1, 2, 3]) {
      expect(await screen.findByRole('switch', { name: `Resolved: comment ${n}` })).toBeTruthy()
    }
  })

  it('says how many looks are used before the button is pressed, and updates it afterwards', async () => {
    mockEditor(() => HttpResponse.json(state(round([pointOn('p1')]), 1, 3)), null, {
      used: 0,
      allowed: 3,
    })
    await renderAt('/p/p1/drafts/d1')
    await screen.findByText('0 of 3 looks used')
    expect(screen.getByRole('button', { name: 'Critique' })).toBeEnabled()
    await fireEvent.click(screen.getByRole('button', { name: 'Critique' }))
    await screen.findByText('1 of 3 looks used')
  })

  it('stops, kindly, when the looks are used up, and says what to do next', async () => {
    mockEditor(() => new Response(null, { status: 500 }), round([pointOn('p1')]), {
      used: 3,
      allowed: 3,
    })
    await renderAt('/p/p1/drafts/d1')
    await screen.findByText(/You have had your 3 looks at this draft/)
    expect(screen.getByRole('button', { name: 'Critique' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'publish it' })).toHaveAttribute(
      'href',
      '/p/p1/drafts/d1#publish',
    )
    expect(screen.getByRole('link', { name: 'account settings' })).toHaveAttribute(
      'href',
      '/account/ai',
    )
    // The critique already made is still there to work from.
    expect(await screen.findByText('A decent start.')).toBeTruthy()
  })

  it('says "look" when the limit is one', async () => {
    mockEditor(() => new Response(null, { status: 500 }), round([pointOn('p1')]), {
      used: 1,
      allowed: 1,
    })
    await renderAt('/p/p1/drafts/d1')
    await screen.findByText(/You have had your 1 look at this draft/)
  })

  it('says so when a draft is ready, rather than finding something', async () => {
    mockEditor(() =>
      HttpResponse.json(state(round([], { summary: 'This is ready to publish.', ready: true }))),
    )
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(await screen.findByRole('button', { name: 'Critique' }))
    await screen.findByText('This is ready to publish.')
    expect(within(await commentsRegion()).queryByRole('listitem')).toBeNull()
    expect(screen.getByText(/nothing important left/i)).toBeTruthy()
  })
})

const bob = { ...testUser, id: 'u2', name: 'Bob Byron', email: 'bob@example.com' }

describe('EditorView comments from members', () => {
  it('lets a member who is not the editor comment, with no critique button and no way to resolve', async () => {
    mockEditor(() => new Response(null, { status: 500 }), null, undefined, bob).comments.push(
      saidBy('c1', 'Bob Byron', { authorId: 'u2' }),
    )
    await renderAt('/p/p1/drafts/d1')
    expect(screen.queryByRole('button', { name: 'Critique' })).toBeNull()
    await showTab('Comments')
    const region = await commentsRegion()
    expect(await within(region).findByText('Bob Byron on the opening.')).toBeTruthy()
    expect(within(region).queryByRole('switch')).toBeNull()
    // They comment from a bar above the text, since they have no toolbar; the composer says who will see it.
    await fireEvent.click(screen.getByRole('button', { name: 'Add comment' }))
    expect(await within(region).findByLabelText('Your comment')).toBeInTheDocument()
    expect(region).toHaveTextContent('Only you and Ada Lovelace, the editor, will see this.')
  })

  it('says so when a member has not commented yet', async () => {
    mockEditor(() => new Response(null, { status: 500 }), null, undefined, bob)
    await renderAt('/p/p1/drafts/d1')
    await showTab('Comments')
    expect(await screen.findByText(/You haven’t commented yet/)).toBeTruthy()
    expect(within(await commentsRegion()).queryByRole('listitem')).toBeNull()
  })

  it('comments from the toolbar: on the paragraph the caret is in, then as a general comment', async () => {
    const sent: unknown[] = []
    const state = mockEditor(() => new Response(null, { status: 500 }), null)
    server.use(
      http.post('*/api/publications/p1/drafts/d1/comments', async ({ request }) => {
        const input = (await request.json()) as { block: string; text: string }
        sent.push(input)
        state.comments.push(saidBy('c1', 'Ada Lovelace', { authorId: 'u1', text: input.text }))
        return HttpResponse.json(state.comments.at(-1), { status: 201 })
      }),
    )
    await renderAt('/p/p1/drafts/d1')
    const editor = await screen.findByRole('textbox', { name: 'Draft body' })
    expect(screen.queryByRole('button', { name: 'Add a comment' })).toBeNull() // the old form is gone
    await fireEvent.focusIn(editor)
    ;(
      document.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }
    ).editor.commands.setTextSelection({ from: 2, to: 6 })
    await fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
    const field = await screen.findByLabelText('Your comment')
    await waitFor(() => expect(field).toHaveFocus()) // typing can start at once
    expect(screen.getByRole('heading', { name: 'Comment on paragraph 1' })).toBeInTheDocument()
    expect(screen.queryByText(/will see this/)).toBeNull() // the editor's own composer has no audience line
    expect(screen.getByRole('button', { name: 'Add comment' })).toBeDisabled() // nothing to say yet
    await fireEvent.update(field, 'This drags.')
    await fireEvent.click(screen.getByRole('button', { name: 'Add comment' }))
    await waitFor(() => expect(sent).toEqual([{ block: 'b1', text: 'This drags.', quote: 'ome' }]))
    await waitFor(() => expect(screen.queryByLabelText('Your comment')).toBeNull()) // closed; the new card is the confirmation
    expect(screen.queryByText('Comment added')).toBeNull()
    expect(await within(await commentsRegion()).findByText('This drags.')).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Comment 1' })).toBeTruthy()

    // With the caret in the title, it is a general comment.
    await fireEvent.focusIn(screen.getByLabelText('Title'))
    await fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
    expect(await screen.findByRole('heading', { name: 'General comment' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'General comment' })).toBeChecked()
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Your comment')).toBeNull()
  })

  it('says why a comment could not be added, and keeps what was written', async () => {
    mockEditor(() => new Response(null, { status: 500 }), null, undefined, bob)
    server.use(
      http.post('*/api/publications/p1/drafts/d1/comments', () =>
        HttpResponse.json(
          { error: "That paragraph isn't in the draft any more." },
          { status: 400 },
        ),
      ),
    )
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(await screen.findByRole('button', { name: 'Add comment' }))
    await fireEvent.update(await screen.findByLabelText('Your comment'), 'Still here.')
    await fireEvent.click(
      within(await commentsRegion()).getByRole('button', { name: 'Add comment' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent("isn't in the draft any more")
    expect(screen.getByLabelText('Your comment')).toHaveValue('Still here.')
  })

  it('shows the editor everyone’s comments by author as a name chip, the AI’s marked, their own named like anyone’s', async () => {
    mockEditor(
      () => new Response(null, { status: 500 }),
      round([pointOn('p1'), saidBy('p2', 'Bob Byron'), saidBy('p3', 'Ada Lovelace')]),
    )
    await renderAt('/p/p1/drafts/d1')
    await showTab('Comments')
    const items = await within(await commentsRegion()).findAllByRole('listitem')
    await waitFor(() => expect(items).toHaveLength(3))
    expect(items[0]).toHaveTextContent('Your AI')
    expect(items[0]!.querySelector('.chip-ai')).not.toBeNull()
    expect(items[1]).toHaveTextContent('Bob Byron')
    expect(items[1]!.querySelector('.chip-ai')).toBeNull() // the highlighter is only for the AI
    expect(items[2]).toHaveTextContent('Ada Lovelace') // the viewer: named, never "You"
    expect(items[2]).not.toHaveTextContent('You')
    expect(within(items[1]!).getByText('Bob Byron')).toHaveClass('rounded-full')
    expect(within(items[2]!).getByText('Ada Lovelace')).toHaveClass('rounded-full')
    // A person's comment is marked in the text too, but not in the highlighter.
    const marks = await screen.findAllByRole('button', { name: /^Comment \d/ })
    expect(marks).toHaveLength(3)
    expect(marks[0]).toHaveClass('is-ai')
    expect(marks[1]).not.toHaveClass('is-ai')
  })

  it('names a commenter whose account is gone without a name', async () => {
    mockEditor(
      () => new Response(null, { status: 500 }),
      round([saidBy('p1', 'x', { authorId: null, authorName: null, text: 'From before.' })]),
    )
    await renderAt('/p/p1/drafts/d1')
    await showTab('Comments')
    expect(await within(await commentsRegion()).findByText('A former member')).toHaveClass(
      'rounded-full',
    )
  })

  it('keeps a comment whose passage was rewritten open, apart from the rest', async () => {
    mockEditor(
      () => new Response(null, { status: 500 }),
      round([
        saidBy('p1', 'Bob Byron', {
          hash: blockHash('Gone.'),
          excerpt: 'Gone.',
          text: 'About the old words.',
        }),
      ]),
    )
    await renderAt('/p/p1/drafts/d1')
    await showTab('Comments')
    const region = await commentsRegion()
    await within(region).findByRole('heading', { name: 'This passage has changed' })
    expect(region).toHaveTextContent('About the old words.')
  })

  it('says it is loading, and what to do when the comments could not be loaded', async () => {
    mockEditor(() => new Response(null, { status: 500 }))
    let fail = true
    server.use(
      http.get('*/api/publications/p1/drafts/d1/comments', () =>
        fail
          ? HttpResponse.json({ error: 'Down' }, { status: 500 })
          : HttpResponse.json([saidBy('p1', 'Bob Byron')]),
      ),
    )
    await renderAt('/p/p1/drafts/d1')
    await showTab('Comments')
    const region = await commentsRegion()
    expect(await within(region).findByRole('alert')).toHaveTextContent(/couldn't load the comments/)
    fail = false
    await fireEvent.click(within(region).getByRole('button', { name: 'Try again' }))
    expect(await within(region).findByText('Bob Byron on the opening.')).toBeTruthy()
  })
})

// ---- pulling notes into the draft ----------------------------------------------------------------------------

const note = (
  id: string,
  text: string,
  extra: Partial<{
    origin: string
    authorName: string | null
    readingItemId: string | null
    quote: boolean
    addedAt: string | null
  }> = {},
) => ({
  id,
  text,
  origin: 'entered',
  authorId: 'u1',
  authorName: 'Ada',
  readingItemId: null,
  tags: [] as string[],
  quote: false,
  addedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
})

const insertion = (text: string, extra: object = {}) => ({
  id: `ins-${text.length}`,
  text,
  origin: 'entered',
  noteAuthorId: 'u1',
  noteAuthorName: 'Ada',
  insertedByName: 'Ada',
  insertedAt: '2026-01-02T00:00:00Z',
  source: null,
  ...extra,
})

/** A fake of the endpoints the drafting page uses, which remembers what it was sent. */
function mockDrafting(
  start: {
    notes?: ReturnType<typeof note>[]
    insertions?: ReturnType<typeof insertion>[]
    /** When the reading-list item (l1, "A paper") was marked read; null while it isn't. */
    readAt?: string | null
    authors?: string[]
    /** Replaces the reading list (by default just l1, "A paper"). */
    links?: { id: string; title: string; tags: string[] }[]
  } = {},
) {
  const state = {
    notes: start.notes ?? [
      note('n1', 'Erosion loops.'),
      note('n2', 'Deposition inside the bend.', { origin: 'brainstorm' }),
      note('n3', 'A useful quote.', { origin: 'reading', readingItemId: 'l1', authorName: 'Bob' }),
      note('n4', 'Already used.', { addedAt: '2026-01-02T00:00:00Z' }),
    ],
    insertions: start.insertions ?? [],
    saved: [] as { title: string; body: string }[],
    posted: [] as unknown[],
    putBack: [] as unknown[],
    readAt: (start.readAt ?? null) as string | null,
    markedRead: [] as unknown[],
    markFails: false,
    saveFails: false,
    postFails: false,
    notesFail: false,
  }
  const ideaNow = () => ({
    id: 'i1',
    publicationId: 'p1',
    name: 'An idea',
    notes: '',
    links: start.links
      ? start.links.map((l) => ({
          ...l,
          url: `https://example.org/${l.id}`,
          authors: [],
          readAt: null,
          origin: 'entered',
        }))
      : [
          {
            id: 'l1',
            url: 'https://example.org/paper',
            title: 'A paper',
            authors: start.authors ?? [],
            readAt: state.readAt,
            origin: 'entered',
            tags: [],
          },
        ],
    drafts: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  })
  server.use(
    signedInAs(testUser),
    http.get('*/api/publications', () => HttpResponse.json([])),
    http.get('*/api/publications/p1/drafts/d1/handover', () =>
      HttpResponse.json({
        editorId: draft.editorId,
        editorName: 'Ada Lovelace',
        offer: null,
        asks: [],
        history: [],
      }),
    ),
    http.get('*/api/publications/p1/ideas/i1', () => HttpResponse.json(ideaNow())),
    http.put('*/api/publications/p1/ideas/i1/links/l1/read', async ({ request }) => {
      const body = (await request.json()) as { read: boolean }
      if (state.markFails) return HttpResponse.json({ error: 'boom' }, { status: 500 })
      state.markedRead.push(body)
      state.readAt = body.read ? '2026-01-04T00:00:00Z' : null
      return HttpResponse.json(ideaNow())
    }),
    http.get('*/api/publications/p1/drafts/d1', () => HttpResponse.json(draft)),
    http.put('*/api/publications/p1/drafts/d1', async ({ request }) => {
      const body = (await request.json()) as { title: string; body: string }
      if (state.saveFails) return HttpResponse.json({ error: 'boom' }, { status: 500 })
      state.saved.push(body)
      return HttpResponse.json({ ...draft, ...body })
    }),
    http.get('*/api/publications/p1/ideas/i1/notes', () =>
      state.notesFail
        ? HttpResponse.json({ error: 'boom' }, { status: 500 })
        : HttpResponse.json(state.notes),
    ),
    http.get('*/api/publications/p1/drafts/d1/insertions', () =>
      HttpResponse.json(state.insertions),
    ),
    http.post('*/api/publications/p1/drafts/d1/insertions', async ({ request }) => {
      const body = (await request.json()) as { noteId: string; text: string }
      if (state.postFails) return HttpResponse.json({ error: 'boom' }, { status: 500 })
      state.posted.push(body)
      state.notes = state.notes.map((n) =>
        n.id === body.noteId ? { ...n, addedAt: '2026-01-03T00:00:00Z' } : n,
      )
      const made = insertion(body.text)
      state.insertions = [...state.insertions, made]
      return HttpResponse.json(made, { status: 201 })
    }),
    http.put('*/api/publications/p1/ideas/i1/notes/:noteId/added', async ({ request, params }) => {
      state.putBack.push({ id: params.noteId, ...((await request.json()) as object) })
      state.notes = state.notes.map((n) => (n.id === params.noteId ? { ...n, addedAt: null } : n))
      return HttpResponse.json(state.notes.find((n) => n.id === params.noteId))
    }),
  )
  return state
}

const drawer = () => screen.getByRole('complementary')
const text = () => document.querySelector('.ProseMirror')!.textContent

describe('the notes beside the draft', () => {
  it('lists the notes not yet used, with where each came from, and hides the ones already added', async () => {
    mockDrafting()
    await renderAt('/p/p1/drafts/d1')
    const notes = within(await screen.findByRole('complementary'))
    await notes.findByText('Erosion loops.')
    expect(notes.getByText('Added')).toBeInTheDocument()
    // The conversation links to the idea's Refine page.
    expect(notes.getByRole('link', { name: 'conversation with your AI' })).toHaveAttribute(
      'href',
      '/p/p1/ideas/i1/refine',
    )
    expect(notes.getByRole('link', { name: /A paper/ })).toBeInTheDocument()
    expect(notes.getAllByText('Bob')[0]).toHaveClass('rounded-full') // the person, as a chip, not "by Bob"
    expect(notes.queryByText('Already used.')).toBeNull()
  })

  it('shows the added ones too when asked, and puts one back', async () => {
    const api = mockDrafting()
    await renderAt('/p/p1/drafts/d1')
    const notes = within(await screen.findByRole('complementary'))
    await fireEvent.click(await notes.findByLabelText('Show added (1)'))
    expect(notes.getByText('Already used.')).toBeInTheDocument()

    await fireEvent.click(notes.getByRole('button', { name: /^Put note “Already used\.” back/ }))
    await waitFor(() => expect(api.putBack).toEqual([{ id: 'n4', added: false }]))
    // Now it can be added again, so it is listed with the others.
    expect(
      await notes.findByRole('button', { name: /^Add note “Already used\.”/ }),
    ).toBeInTheDocument()
  })

  it('says so when there are no notes, and when every note is in a draft', async () => {
    mockDrafting({ notes: [] })
    await renderAt('/p/p1/drafts/d1')
    expect(await screen.findByText(/No notes yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add notes on the idea page.' })).toHaveAttribute(
      'href',
      '/p/p1/ideas/i1/notes',
    )
  })

  it('says all notes are used when they all are', async () => {
    mockDrafting({ notes: [note('n1', 'Done.', { addedAt: '2026-01-02T00:00:00Z' })] })
    await renderAt('/p/p1/drafts/d1')
    expect(await screen.findByText('All your notes are in a draft.')).toBeInTheDocument()
  })

  it('explains when the notes cannot be loaded, and tries again', async () => {
    const api = mockDrafting()
    api.notesFail = true
    await renderAt('/p/p1/drafts/d1')
    expect(
      await within(await screen.findByRole('complementary')).findByRole('alert'),
    ).toHaveTextContent("couldn't load the notes")
    api.notesFail = false
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Erosion loops.')).toBeInTheDocument()
  })

  describe('adding a note to the draft', () => {
    it('puts its words after the first paragraph, saves the draft, then marks the note as added', async () => {
      const api = mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      await fireEvent.click(
        await screen.findByRole('button', { name: /^Add note “Erosion loops\.” to the draft/ }),
      )

      await waitFor(() => expect(api.posted).toEqual([{ noteId: 'n1', text: 'Erosion loops.' }]))
      expect(text()).toContain('Some text')
      expect(text()).toContain('Erosion loops.')
      expect(text()!.indexOf('Some text')).toBeLessThan(text()!.indexOf('Erosion loops.'))
      // The draft was saved with the words in it before the note was marked added.
      expect(api.saved.at(-1)!.body).toContain('Erosion loops.')
      await waitFor(() => expect(within(drawer()).queryByText('Erosion loops.')).toBeNull()) // gone from the list
    })

    it('adds a link to the reading-list item a note came from', async () => {
      const api = mockDrafting({ readAt: '2026-01-02T00:00:00Z' })
      await renderAt('/p/p1/drafts/d1')
      await fireEvent.click(
        await screen.findByRole('button', { name: /^Add note “A useful quote\.” to the draft/ }),
      )
      await waitFor(() => expect(api.posted).toHaveLength(1))
      expect(api.posted[0]).toEqual({
        noteId: 'n3',
        text: 'A useful quote. ([A paper](https://example.org/paper))',
      })
      const link = document.querySelector('.ProseMirror a')!
      expect(link).toHaveAttribute('href', 'https://example.org/paper')
      expect(link).toHaveTextContent('A paper')
    })

    it('puts a quotation in as a blockquote with its source inside it', async () => {
      const api = mockDrafting({
        notes: [
          note('n1', 'Meanders grow.\nBends move.', {
            origin: 'reading',
            readingItemId: 'l1',
            quote: true,
          }),
        ],
      })
      await renderAt('/p/p1/drafts/d1')
      expect(await screen.findByRole('link', { name: /A paper/ })).toBeInTheDocument()
      await fireEvent.click(
        await screen.findByRole('button', { name: /^Add note “Meanders grow\.” to the draft/ }),
      )
      await waitFor(() => expect(api.posted).toHaveLength(1))
      expect(api.posted[0]).toEqual({
        noteId: 'n1',
        text: '> Meanders grow.\n> Bends move.\n>\n> — [A paper](https://example.org/paper)',
      })
      const quoted = document.querySelector('.ProseMirror blockquote')!
      expect(quoted).toHaveTextContent('Meanders grow.')
      expect(quoted.querySelector('a')).toHaveAttribute('href', 'https://example.org/paper')
      expect(api.saved.at(-1)!.body).toMatch(/^> /m)
    })

    it('does not mark the note as added if the draft could not be saved, and says so', async () => {
      const api = mockDrafting()
      api.saveFails = true
      await renderAt('/p/p1/drafts/d1')
      await fireEvent.click(
        await screen.findByRole('button', { name: /^Add note “Erosion loops\.” to the draft/ }),
      )
      expect(await within(drawer()).findByRole('alert')).toHaveTextContent(
        "couldn't save the draft",
      )
      expect(api.posted).toEqual([])
      expect(
        within(drawer()).getByRole('button', { name: /^Add note “Erosion loops\.”/ }),
      ).toBeEnabled()
    })

    it('says so if the note could not be marked as added after the draft was saved', async () => {
      const api = mockDrafting()
      api.postFails = true
      await renderAt('/p/p1/drafts/d1')
      await fireEvent.click(
        await screen.findByRole('button', { name: /^Add note “Erosion loops\.” to the draft/ }),
      )
      expect(await within(drawer()).findByRole('alert')).toHaveTextContent(
        "couldn't mark the note as added",
      )
      expect(api.saved.at(-1)!.body).toContain('Erosion loops.')
    })
  })

  describe('dragging a note into the draft', () => {
    /** What the browser hands the handlers: the types being dragged, and the data under each. */
    const carrying = (type: string, data: string) => ({
      dataTransfer: {
        types: [type],
        getData: (t: string) => (t === type ? data : ''),
        setData: vi.fn(),
        setDragImage: vi.fn(),
        effectAllowed: '',
        dropEffect: '',
      },
    })
    const editorEl = () => document.querySelector('.ProseMirror')!
    const grip = async (start: RegExp) =>
      (await screen.findByText(start)).closest('li')!.querySelector('[data-testid="rail"]')!

    afterEach(() => vi.restoreAllMocks())

    it('picks a note up by its rail, carrying only its id', async () => {
      mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      const drag = carrying(NOTE_DRAG_TYPE, '')
      await fireEvent.dragStart(await grip(/^Erosion loops\./), drag)
      expect(drag.dataTransfer.setData).toHaveBeenCalledWith(NOTE_DRAG_TYPE, 'n1')
      expect(drag.dataTransfer.effectAllowed).toBe('copy')
      expect(drag.dataTransfer.setDragImage).toHaveBeenCalled()
    })

    it('puts a dropped note in the draft as the button would: saved, recorded, and set aside', async () => {
      const api = mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      await screen.findByText('Erosion loops.')
      await fireEvent.drop(editorEl(), carrying(NOTE_DRAG_TYPE, 'n1'))

      await waitFor(() => expect(api.posted).toEqual([{ noteId: 'n1', text: 'Erosion loops.' }]))
      expect(document.querySelector('.ProseMirror')!.textContent).toContain('Erosion loops.')
      expect(api.saved.at(-1)!.body).toContain('Erosion loops.')
      await waitFor(() => expect(within(drawer()).queryByText('Erosion loops.')).toBeNull()) // set aside
    })

    it('keeps the source link with a note taken from a source, as the button does', async () => {
      const api = mockDrafting({ readAt: '2026-01-02T00:00:00Z' })
      await renderAt('/p/p1/drafts/d1')
      await screen.findByText('A useful quote.')
      await fireEvent.drop(editorEl(), carrying(NOTE_DRAG_TYPE, 'n3'))
      await waitFor(() => expect(api.posted).toHaveLength(1))
      expect(api.posted[0]).toEqual({
        noteId: 'n3',
        text: 'A useful quote. ([A paper](https://example.org/paper))',
      })
      expect(document.querySelector('.ProseMirror a')).toHaveAttribute(
        'href',
        'https://example.org/paper',
      )
    })

    it('picks a reading item up by its rail too, carrying only its id', async () => {
      mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      await showTab('Reading list')
      const drag = carrying(READING_DRAG_TYPE, '')
      const rail = (await screen.findByText('Not marked as read'))
        .closest('li')!
        .querySelector('[data-testid="rail"]')!
      await fireEvent.dragStart(rail, drag)
      expect(drag.dataTransfer.setData).toHaveBeenCalledWith(READING_DRAG_TYPE, 'l1')
      expect(drag.dataTransfer.effectAllowed).toBe('copy')
    })

    it('puts a dropped reading item in the draft as a link, with who wrote it, and saves', async () => {
      const api = mockDrafting({
        readAt: '2026-01-02T00:00:00Z',
        authors: ['Ada Lovelace', 'Bo Chen'],
      })
      await renderAt('/p/p1/drafts/d1')
      await screen.findByText('Erosion loops.')
      await fireEvent.drop(editorEl(), carrying(READING_DRAG_TYPE, 'l1'))

      await waitFor(() => expect(api.saved).toHaveLength(1))
      expect(api.saved[0]!.body).toContain(
        '[A paper](https://example.org/paper) by Ada Lovelace and Bo Chen',
      )
      expect(api.posted).toEqual([]) // a link is not a note: nothing is set aside
    })

    it('asks first when the dropped reading item is not marked read, and inserts nothing yet', async () => {
      const api = mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      await screen.findByText('Erosion loops.')
      await fireEvent.drop(editorEl(), carrying(READING_DRAG_TYPE, 'l1'))
      expect(
        await screen.findByRole('dialog', { name: 'You haven’t marked this as read' }),
      ).toBeInTheDocument()
      expect(api.saved).toEqual([])
    })

    it('says so when a dropped reading item is no longer on the list', async () => {
      mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      await screen.findByText('Erosion loops.')
      await fireEvent.drop(editorEl(), carrying(READING_DRAG_TYPE, 'gone'))
      expect(await screen.findByRole('alert')).toHaveTextContent("couldn't find that reading item")
    })

    it('ignores anything else dropped on the draft (a file, some text)', async () => {
      const api = mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      await screen.findByText('Erosion loops.')
      await fireEvent.drop(editorEl(), carrying('Files', ''))
      await fireEvent.drop(editorEl(), carrying('text/plain', 'n1'))
      await new Promise((r) => setTimeout(r, 50))
      expect(api.posted).toEqual([])
      expect(api.saved).toEqual([])
    })

    it('says so when the note is already in a draft, or cannot be found, and adds nothing', async () => {
      const api = mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      await screen.findByText('Erosion loops.')
      await fireEvent.drop(editorEl(), carrying(NOTE_DRAG_TYPE, 'n4')) // already used
      expect(await within(drawer()).findByRole('alert')).toHaveTextContent('already in a draft')
      await fireEvent.drop(editorEl(), carrying(NOTE_DRAG_TYPE, 'gone'))
      expect(await within(drawer()).findByRole('alert')).toHaveTextContent(
        "couldn't find that note",
      )
      expect(api.posted).toEqual([])
    })

    it('shows why when the draft could not be saved, and does not set the note aside', async () => {
      const api = mockDrafting()
      api.saveFails = true
      await renderAt('/p/p1/drafts/d1')
      await screen.findByText('Erosion loops.')
      await fireEvent.drop(editorEl(), carrying(NOTE_DRAG_TYPE, 'n1'))
      expect(await within(drawer()).findByRole('alert')).toHaveTextContent(
        "couldn't save the draft",
      )
      expect(api.posted).toEqual([])
    })

    it('does not let two drops overlap', async () => {
      const api = mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      await screen.findByText('Erosion loops.')
      await fireEvent.drop(editorEl(), carrying(NOTE_DRAG_TYPE, 'n1'))
      await fireEvent.drop(editorEl(), carrying(NOTE_DRAG_TYPE, 'n1'))
      await waitFor(() => expect(api.posted).toHaveLength(1))
      await new Promise((r) => setTimeout(r, 50))
      expect(api.posted).toHaveLength(1)
    })
  })

  describe('citing something from the reading list', () => {
    const insertLink = async () => {
      await showTab('Reading list')
      await fireEvent.click(
        await within(await screen.findByRole('complementary')).findByRole('button', {
          name: 'Add a link to “A paper” to the draft',
        }),
      )
    }
    const dialog = () => screen.findByRole('dialog', { name: 'You haven’t marked this as read' })

    afterEach(() => vi.restoreAllMocks())

    it('lists the items, saying which are read', async () => {
      mockDrafting({ readAt: '2026-01-02T00:00:00Z' })
      await renderAt('/p/p1/drafts/d1')
      await showTab('Reading list')
      const list = within(await screen.findByRole('region', { name: 'Reading list' }))
      expect(await list.findByText('A paper')).toBeInTheDocument()
      expect(list.queryByText('Not marked as read')).toBeNull() // read is the quiet default
    })

    it('shows who wrote an item, and offers to add it with one icon button named for it', async () => {
      mockDrafting({ readAt: '2026-01-02T00:00:00Z', authors: ['Ada Lovelace', 'Bo Chen'] })
      await renderAt('/p/p1/drafts/d1')
      await showTab('Reading list')
      const list = within(await screen.findByRole('region', { name: 'Reading list' }))
      expect(await list.findByText('by Ada Lovelace and Bo Chen')).toBeInTheDocument()
      expect(
        list.getByRole('button', { name: 'Add a link to “A paper” to the draft' }),
      ).toBeTruthy()
    })

    it('marks an item that has not been read, and no other', async () => {
      mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      await showTab('Reading list')
      expect(await screen.findByText('Not marked as read')).toBeInTheDocument()
    })

    it('says so when there is nothing on the reading list', async () => {
      mockDrafting()
      server.use(
        http.get('*/api/publications/p1/ideas/i1', () =>
          HttpResponse.json({
            id: 'i1',
            publicationId: 'p1',
            name: 'An idea',
            notes: '',
            links: [],
            drafts: [],
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          }),
        ),
      )
      await renderAt('/p/p1/drafts/d1')
      await showTab('Reading list')
      expect(await screen.findByText(/Nothing on the reading list yet\./)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Add to it on the idea page.' })).toHaveAttribute(
        'href',
        '/p/p1/ideas/i1/read',
      )
    })

    it('puts a link to a read item in the line being written, and saves the draft, without asking', async () => {
      const api = mockDrafting({ readAt: '2026-01-02T00:00:00Z' })
      await renderAt('/p/p1/drafts/d1')
      await insertLink()
      await waitFor(() => expect(api.saved).toHaveLength(1))
      expect(api.saved[0]!.body).toContain('[A paper](https://example.org/paper)')
      expect(screen.queryByRole('dialog')).toBeNull()
      const link = document.querySelector('.ProseMirror a')!
      expect(link).toHaveAttribute('href', 'https://example.org/paper')
      expect(document.querySelectorAll('.ProseMirror p')).toHaveLength(1) // in the line, not a new paragraph
    })

    it('makes the link something that can be opened: Ctrl or Cmd and click opens it, a plain click only edits', async () => {
      mockDrafting({ readAt: '2026-01-02T00:00:00Z' })
      const open = vi.spyOn(window, 'open').mockImplementation(() => null)
      await renderAt('/p/p1/drafts/d1')
      await insertLink()
      const link = await waitFor(() => {
        const a = document.querySelector('.ProseMirror a')
        if (!a) throw new Error('no link yet')
        return a
      })
      expect(screen.getByText('Ctrl or ⌘ and click a link to open it.')).toBeInTheDocument()

      await fireEvent.click(link)
      expect(open).not.toHaveBeenCalled()
      await fireEvent.click(link, { ctrlKey: true })
      expect(open).toHaveBeenCalledWith('https://example.org/paper', '_blank', 'noopener')
      await fireEvent.click(link, { metaKey: true })
      expect(open).toHaveBeenCalledTimes(2)
    })

    describe('when it is not marked read', () => {
      it('asks first, with the safe choice focused, and offers to read it, mark it read, or cancel', async () => {
        const api = mockDrafting()
        await renderAt('/p/p1/drafts/d1')
        await insertLink()
        const box = await dialog()
        expect(box).toHaveTextContent('“A paper” is on your reading list')
        const cancel = within(box).getByRole('button', { name: 'Cancel' })
        await waitFor(() => expect(cancel).toHaveFocus())
        expect(within(box).getByRole('button', { name: 'Read it now' })).toBeInTheDocument()
        expect(within(box).getByRole('button', { name: 'Mark as read' })).toBeInTheDocument()
        expect(api.saved).toEqual([]) // nothing yet
      })

      it('inserts nothing, and marks nothing, when cancelled (also with Escape)', async () => {
        const api = mockDrafting()
        await renderAt('/p/p1/drafts/d1')
        await insertLink()
        await fireEvent.click(within(await dialog()).getByRole('button', { name: 'Cancel' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

        await insertLink()
        await dialog()
        await fireEvent.keyDown(document, { key: 'Escape' })
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

        expect(document.querySelector('.ProseMirror a')).toBeNull()
        expect(api.markedRead).toEqual([])
        expect(api.saved).toEqual([])
      })

      it('marks it as read, then inserts the link', async () => {
        const api = mockDrafting()
        await renderAt('/p/p1/drafts/d1')
        await insertLink()
        await fireEvent.click(within(await dialog()).getByRole('button', { name: 'Mark as read' }))

        await waitFor(() => expect(api.saved).toHaveLength(1))
        expect(api.markedRead).toEqual([{ read: true }])
        expect(api.saved[0]!.body).toContain('[A paper](https://example.org/paper)')
        expect(screen.queryByRole('dialog')).toBeNull()
        const list = within(screen.getByRole('region', { name: 'Reading list' }))
        await waitFor(() => expect(list.queryByText('Not marked as read')).toBeNull()) // now shown as read
      })

      it('opens it in a new tab on "Read it now", inserting nothing and keeping the draft as it is', async () => {
        const api = mockDrafting()
        const open = vi.spyOn(window, 'open').mockImplementation(() => null)
        await renderAt('/p/p1/drafts/d1')
        await insertLink()
        await fireEvent.click(within(await dialog()).getByRole('button', { name: 'Read it now' }))

        await waitFor(() =>
          expect(open).toHaveBeenCalledWith('/p/p1/ideas/i1/reading/l1', '_blank', 'noopener'),
        )
        expect(await screen.findByText(/Opened “A paper” in a new tab/)).toBeInTheDocument()
        expect(api.markedRead).toEqual([])
        expect(api.saved).toEqual([])
        expect(document.querySelector('.ProseMirror a')).toBeNull()
        expect(screen.getByText('Not marked as read')).toBeInTheDocument()
      })

      it('says so if it could not be marked as read, and inserts nothing', async () => {
        const api = mockDrafting()
        api.markFails = true
        await renderAt('/p/p1/drafts/d1')
        await insertLink()
        await fireEvent.click(within(await dialog()).getByRole('button', { name: 'Mark as read' }))
        const alert = await within(screen.getByRole('region', { name: 'Reading list' })).findByRole(
          'alert',
        )
        expect(alert).toHaveTextContent("couldn't mark it as read")
        expect(api.saved).toEqual([])
        expect(document.querySelector('.ProseMirror a')).toBeNull()
      })
    })

    it('does not ask for a note taken from the item, even if the item is not ticked: taking the note was the reading', async () => {
      const api = mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      await fireEvent.click(
        await screen.findByRole('button', { name: /^Add note “A useful quote\.” to the draft/ }),
      )
      await waitFor(() => expect(api.posted).toHaveLength(1))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(api.markedRead).toEqual([])
    })
  })

  describe('tags', () => {
    const tagged = () => [
      { ...note('n1', 'Erosion loops.'), tags: ['intro'] },
      { ...note('n2', 'Deposition inside the bend.'), tags: ['part 2'] },
      note('n3', 'Untagged thought.'),
      { ...note('n4', 'Already used.', { addedAt: '2026-01-02T00:00:00Z' }), tags: ['solo'] },
    ]
    const listed = () =>
      within(screen.getByRole('list', { name: 'Notes to add' }))
        .getAllByRole('listitem')
        .filter((li) => li.querySelector('p'))
        .map((li) => li.querySelector('p')!.textContent)

    it('are shown on the notes, and can narrow the list to the tags chosen, for adding what belongs in this part', async () => {
      mockDrafting({ notes: tagged() })
      await renderAt('/p/p1/drafts/d1')
      const notes = within(await screen.findByRole('complementary'))
      await notes.findByText('Erosion loops.')
      const select = notes.getByRole('combobox', { name: 'Filter by tag' })
      // Only tags on notes that can still be added are offered; "solo" is only on an added note.
      expect(
        Array.from(select.querySelectorAll('option')).map((o) => o.textContent?.trim()),
      ).toEqual(['Choose a tag', 'intro', 'part 2'])
      await fireEvent.update(select, 'part 2')
      expect(listed()).toEqual(['Deposition inside the bend.'])
      await fireEvent.update(select, 'intro')
      expect(notes.queryByRole('list', { name: 'Notes to add' })).toBeNull()
      expect(notes.getByText('No notes have all these tags.')).toBeInTheDocument()
      await fireEvent.click(notes.getByRole('button', { name: 'Stop filtering by intro' }))
      await fireEvent.click(notes.getByRole('button', { name: 'Stop filtering by part 2' }))
      expect(listed()).toEqual([
        'Erosion loops.',
        'Deposition inside the bend.',
        'Untagged thought.',
      ])
    })

    it('are shown on the reading items, which can be narrowed to those with all the chosen tags', async () => {
      mockDrafting({
        links: [
          { id: 'l1', title: 'A paper', tags: ['background', 'part 2'] },
          { id: 'l2', title: 'Other', tags: ['background'] },
          { id: 'l3', title: 'Bare', tags: [] },
        ],
      })
      await renderAt('/p/p1/drafts/d1')
      await showTab('Reading list')
      const list = within(await screen.findByRole('region', { name: 'Reading list' }))
      await list.findByText('A paper')
      expect(list.getAllByRole('list', { name: 'Tags' })).toHaveLength(2)
      const select = list.getByRole('combobox', { name: 'Filter by tag' })
      await fireEvent.update(select, 'background')
      expect(list.queryByText('Bare')).toBeNull()
      await fireEvent.update(select, 'part 2')
      expect(list.getByText('A paper')).toBeInTheDocument()
      expect(list.queryByText('Other')).toBeNull()
      await fireEvent.click(list.getByRole('button', { name: 'Stop filtering by background' }))
      await fireEvent.click(list.getByRole('button', { name: 'Stop filtering by part 2' }))
      expect(list.getByText('Bare')).toBeInTheDocument()
    })

    it('says so when no reading item has all the chosen tags', async () => {
      mockDrafting({
        links: [
          { id: 'l1', title: 'A paper', tags: ['a'] },
          { id: 'l2', title: 'Other', tags: ['b'] },
        ],
      })
      await renderAt('/p/p1/drafts/d1')
      await showTab('Reading list')
      const list = within(await screen.findByRole('region', { name: 'Reading list' }))
      const select = await list.findByRole('combobox', { name: 'Filter by tag' })
      await fireEvent.update(select, 'a')
      await fireEvent.update(select, 'b')
      expect(list.getByText('No items have all these tags.')).toBeInTheDocument()
    })

    it('say so when nothing is left with the tag once its notes are in the draft', async () => {
      mockDrafting({ notes: tagged() })
      await renderAt('/p/p1/drafts/d1')
      const notes = within(await screen.findByRole('complementary'))
      await fireEvent.update(await notes.findByRole('combobox', { name: 'Filter by tag' }), 'intro')
      await fireEvent.click(
        notes.getByRole('button', { name: /^Add note “Erosion loops\.” to the draft/ }),
      )
      // The tag is no longer on anything that can be added, so the filter goes back to everything.
      await waitFor(() => expect(listed()).toContain('Untagged thought.'))
      expect(notes.queryByRole('button', { name: 'Stop filtering by intro' })).toBeNull()
    })
  })

  describe('where the words came from', () => {
    it('lists what was pulled in, with its origin, and whether it is still as inserted', async () => {
      mockDrafting({
        insertions: [
          insertion('Some text', { origin: 'brainstorm' }),
          insertion('Words that were rewritten since.', {
            origin: 'reading',
            noteAuthorId: null,
            noteAuthorName: 'Bob',
            source: { title: 'A paper', url: 'https://example.org/paper' },
          }),
        ],
      })
      await renderAt('/p/p1/drafts/d1')
      const summary = (await screen.findByText('Where some of the words came from (2)')).closest(
        'details',
      )!
      const rows = within(summary).getAllByRole('listitem')
      expectOrigin(rows[0]!, 'From conversation with your AI', 'Ada')
      expect(rows[0]).toHaveTextContent('Still as inserted')
      expectOrigin(rows[1]!, 'From A paper', 'Bob')
      expect(rows[1]).toHaveTextContent('Edited or removed since')
    })

    it('is not shown when nothing has been pulled in', async () => {
      mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      await screen.findByText('Erosion loops.')
      expect(screen.queryByText(/Where some of the words came from/)).toBeNull()
    })
  })

  describe('on a phone', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('slides in from an Open panel button, and closes with its own button or Escape, returning focus', async () => {
      mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      const open = await screen.findByRole('button', { name: 'Open panel' })
      expect(open).toHaveAttribute('aria-expanded', 'false')
      expect(open).toHaveAttribute('aria-controls', 'draft-notes')

      await fireEvent.click(open)
      expect(open).toHaveAttribute('aria-expanded', 'true')
      const close = screen.getByRole('button', { name: 'Close panel' })
      await waitFor(() => expect(close).toHaveFocus())
      expect(drawer()).not.toHaveClass('max-lg:invisible')

      await fireEvent.click(close)
      expect(open).toHaveAttribute('aria-expanded', 'false')
      expect(drawer()).toHaveClass('max-lg:invisible') // not reachable by keyboard or screen reader while shut
      await waitFor(() => expect(open).toHaveFocus())

      await fireEvent.click(open)
      await fireEvent.keyDown(screen.getByRole('button', { name: 'Close panel' }), {
        key: 'Escape',
      })
      expect(open).toHaveAttribute('aria-expanded', 'false')
    })

    it('opens on the comment when a mark in the text is pressed, and gets out of the way to show a comment', async () => {
      vi.stubGlobal('matchMedia', () => ({ matches: false }))
      mockDrafting()
      mockEditor(() => new Response(null, { status: 500 }), round([pointOn('p1')]))
      await renderAt('/p/p1/drafts/d1')
      const open = await screen.findByRole('button', { name: 'Open panel' })
      await fireEvent.click(await screen.findByRole('button', { name: 'Comment 1' }))
      await waitFor(() => expect(open).toHaveAttribute('aria-expanded', 'true'))
      expect(screen.getByRole('tab', { name: /^Comments/ })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      const comment = await screen.findByRole('button', { name: /Tighten the opening/ })
      await waitFor(() => expect(comment).toHaveFocus())

      await fireEvent.click(comment) // shows the paragraph, so the drawer is no longer over it
      await waitFor(() => expect(open).toHaveAttribute('aria-expanded', 'false'))
      await waitFor(() => expect(document.querySelector('.ProseMirror')).toHaveFocus())
    })
  })
})

describe('the tabs beside the draft', () => {
  it('has Notes, Reading list and Comments, one in the tab order, with Notes first', async () => {
    mockDrafting()
    await renderAt('/p/p1/drafts/d1')
    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Notes', 'Reading list', 'Comments'])
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
    const panel = screen.getByRole('tabpanel', { name: 'Notes' })
    expect(panel).not.toHaveAttribute('hidden')
    expect(screen.getAllByRole('tabpanel', { hidden: true })).toHaveLength(3)
  })

  it('moves with the arrow keys, Home and End, showing the panel of the tab reached', async () => {
    mockDrafting()
    await renderAt('/p/p1/drafts/d1')
    const notes = await screen.findByRole('tab', { name: 'Notes' })
    notes.focus()
    await fireEvent.keyDown(notes, { key: 'ArrowRight' })
    const reading = screen.getByRole('tab', { name: 'Reading list' })
    expect(reading).toHaveAttribute('aria-selected', 'true')
    expect(reading).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: 'Reading list' })).toBeVisible()
    await fireEvent.keyDown(reading, { key: 'End' })
    expect(screen.getByRole('tab', { name: /^Comments/ })).toHaveFocus()
    await fireEvent.keyDown(screen.getByRole('tab', { name: /^Comments/ }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Notes' })).toHaveFocus() // wraps round
    await fireEvent.keyDown(screen.getByRole('tab', { name: 'Notes' }), { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: /^Comments/ })).toHaveFocus()
    await fireEvent.keyDown(screen.getByRole('tab', { name: /^Comments/ }), { key: 'Home' })
    expect(screen.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps the hidden panels mounted, so a note half-written is not lost on switching tabs', async () => {
    mockDrafting()
    await renderAt('/p/p1/drafts/d1')
    await screen.findByRole('tab', { name: 'Notes' })
    expect(screen.getAllByRole('tabpanel', { hidden: true })[0]).toBeInTheDocument()
    await showTab('Comments')
    const notesPanel = document.getElementById(
      screen.getByRole('tab', { name: 'Notes' }).getAttribute('aria-controls')!,
    )!
    expect(notesPanel).toHaveAttribute('hidden')
    expect(notesPanel.textContent).toContain('Notes') // still there, only out of sight
  })

  it('does not repeat the tab names as visible headings in the panels, but keeps them for a screen reader', async () => {
    mockDrafting()
    mockEditor(() => new Response(null, { status: 500 }), round([pointOn('p1')]))
    await renderAt('/p/p1/drafts/d1')
    await screen.findByRole('tab', { name: 'Notes' })
    for (const name of ['Notes', 'Reading list', 'Comments']) {
      const heading = screen.getByRole('heading', { level: 2, name, hidden: true })
      expect(heading, name).toHaveClass('sr-only')
    }
  })
})

describe('publishing from the draft page', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  /** A clipboard that records what it is given, with or without support for rich text. */
  function stubClipboard(opts: { rich: boolean; plainFails?: boolean }) {
    const writeText = vi.fn(async () => {
      if (opts.plainFails) throw new Error('denied')
    })
    const write = vi.fn().mockResolvedValue(undefined)
    class FakeItem {
      constructor(public data: Record<string, Blob>) {}
    }
    // Only the clipboard is replaced: the editor reads other things (the platform) from the real navigator.
    Object.defineProperty(navigator, 'clipboard', {
      value: opts.rich ? { writeText, write } : { writeText },
      configurable: true,
    })
    if (opts.rich) vi.stubGlobal('ClipboardItem', FakeItem)
    else vi.stubGlobal('ClipboardItem', undefined)
    return { writeText, write }
  }
  const textOf = (blob: Blob) => blob.text()

  async function openDraft() {
    mockEditor(() => new Response(null, { status: 500 }))
    server.use(
      http.get('*/api/publications/p1/drafts/d1', () =>
        HttpResponse.json({
          ...draft,
          title: 'Part 1',
          body: 'Erosion **loops**.\n\nBends migrate.',
        }),
      ),
    )
    await renderAt('/p/p1/drafts/d1')
    return screen.findByRole('region', { name: 'Publish' })
  }

  it('sits at the bottom of the draft, with what happens to the idea behind an info icon', async () => {
    const section = await openDraft()
    expect(
      within(section).getByRole('button', { name: 'About publishing' }),
    ).toHaveAccessibleDescription(/it leaves Keep writing, and your idea stays here/)
  })

  it('copies the title and body as rich text, with plain text beside it', async () => {
    const { write } = stubClipboard({ rich: true })
    const section = await openDraft()
    await fireEvent.click(within(section).getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    const item = write.mock.calls[0]![0][0] as { data: Record<string, Blob> }
    expect(await textOf(item.data['text/html']!)).toBe(
      '<h1>Part 1</h1>\n<p>Erosion <strong>loops</strong>.</p>\n<p>Bends migrate.</p>\n',
    )
    expect(await textOf(item.data['text/plain']!)).toBe(
      'Part 1\n\nErosion **loops**.\n\nBends migrate.\n',
    )
    expect(await within(section).findByText(/^Copied$/)).toBeTruthy()
  })

  it('copies the plain words when rich copy is not supported', async () => {
    const { writeText } = stubClipboard({ rich: false })
    const section = await openDraft()
    await fireEvent.click(within(section).getByRole('button', { name: 'Copy' }))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('Part 1\n\nErosion **loops**.\n\nBends migrate.\n'),
    )
    expect(await within(section).findByText(/^Copied$/)).toBeTruthy()
  })

  it('copies the Markdown, title first as a heading', async () => {
    const { writeText } = stubClipboard({ rich: true })
    const section = await openDraft()
    await fireEvent.click(within(section).getByRole('button', { name: 'Copy as Markdown' }))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('# Part 1\n\nErosion **loops**.\n\nBends migrate.\n'),
    )
    expect(await within(section).findByText(/^Copied$/)).toBeTruthy()
  })

  it('shows the text to select when the clipboard is out of reach', async () => {
    stubClipboard({ rich: false, plainFails: true })
    const section = await openDraft()
    await fireEvent.click(within(section).getByRole('button', { name: 'Copy as Markdown' }))
    expect(await within(section).findByText(/couldn’t reach your clipboard/)).toBeTruthy()
    expect(within(section).getByLabelText(/to select and copy/)).toHaveValue(
      '# Part 1\n\nErosion **loops**.\n\nBends migrate.\n',
    )
  })
})

describe('what the editing page says, and where', () => {
  const tutorial = (on: boolean) => server.use(signedInAs({ ...testUser, tutorialMode: on }))

  it('says on the page what Critique sends and does not send, whatever the mode', async () => {
    mockEditor(() => new Response(null))
    await renderAt('/p/p1/drafts/d1')
    const button = await screen.findByRole('button', { name: 'Critique' })
    expect(
      screen.getByText(
        'Critique will send this publication’s description and this draft’s title and text to your AI. It will not send your notes.',
      ),
    ).toBeInTheDocument()
    expect(button).toHaveAccessibleDescription(/It will not send your notes/)
  })

  it('keeps the explanations behind info icons while tutorial mode is off', async () => {
    mockEditor(() => new Response(null))
    await renderAt('/p/p1/drafts/d1')
    await screen.findByRole('button', { name: 'Critique' })
    expect(screen.getByRole('button', { name: 'About Critique' })).toHaveAccessibleDescription(
      /never rewrites/,
    )
    expect(screen.queryByRole('button', { name: 'About rephrasing' })).toBeNull()
  })

  it('puts each icon beside its own button, and none on a line of its own', async () => {
    mockEditor(() => new Response(null))
    await renderAt('/p/p1/drafts/d1')
    const critique = await screen.findByRole('button', { name: 'Critique' })
    const row = critique.parentElement!
    expect(row.contains(screen.getByRole('button', { name: 'About Critique' }))).toBe(true)
    expectNoLoneInfoIcons(document.body)
  })

  it('has no info icon beside the Notes tab, only the tutorial note', async () => {
    mockEditor(() => new Response(null))
    await renderAt('/p/p1/drafts/d1')
    await screen.findByRole('button', { name: 'Critique' })
    expect(screen.queryByRole('button', { name: 'About adding notes' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'About inserting links' })).toBeNull()
  })

  it('writes the same explanations out in tutorial mode', async () => {
    mockEditor(() => new Response(null))
    tutorial(true)
    await renderAt('/p/p1/drafts/d1')
    expect(await screen.findByText(/never rewrites/)).toBeInTheDocument()
    expect(screen.getByText(/Rephrase offers other ways to put the words/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'About Critique' })).toBeNull()
  })
})

describe('a draft has one editor (#154)', () => {
  const bobsDraft = { ...draft, editorId: 'u2', editorName: 'Bob Jones' }

  it('shows someone else’s draft read-only, names the editor, and offers no way to change it', async () => {
    mockEditor(() => HttpResponse.json({}))
    server.use(http.get('*/api/publications/p1/drafts/d1', () => HttpResponse.json(bobsDraft)))
    await renderAt('/p/p1/drafts/d1')
    const banner = await screen.findByTestId('read-only')
    expect(banner).toHaveTextContent('Bob Jones is this draft’s editor')
    expect(within(banner).getByText('Bob Jones')).toHaveClass('rounded-full') // the name chip
    expect(screen.getByLabelText('Title')).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Critique' })).toBeNull()
    expect(screen.getByRole('tab', { name: /^Comments/ })).toBeTruthy() // anyone can comment
    expect(screen.queryByText(/Copy as Markdown/)).toBeNull() // publishing is the editor's
    await waitFor(() =>
      expect(document.querySelector('.ProseMirror')).toHaveAttribute('contenteditable', 'false'),
    )
  })

  it('says who can add to the draft, once, instead of offering to', async () => {
    mockDrafting()
    server.use(http.get('*/api/publications/p1/drafts/d1', () => HttpResponse.json(bobsDraft)))
    await renderAt('/p/p1/drafts/d1')
    const notes = within(await screen.findByRole('complementary'))
    await notes.findByText('Erosion loops.')
    expect(
      notes.getByText('Only Bob Jones, the draft’s editor, can add to the draft.'),
    ).toBeTruthy()
    expect(notes.queryByRole('button', { name: /^Add note/ })).toBeNull()
    expect(notes.queryByTestId('rail')).toBeNull()
    await showTab('Reading list')
    expect(await screen.findByText('Not marked as read')).toBeTruthy() // the item is listed
    expect(screen.queryByRole('button', { name: /^Add a link/ })).toBeNull()
    expect(screen.queryByTestId('rail')).toBeNull()
  })

  it('sends the version a save was made from, and the next save the version after it', async () => {
    const sent: { version: number; body: string }[] = []
    mockEditor(() => HttpResponse.json({}))
    server.use(
      http.put('*/api/publications/p1/drafts/d1', async ({ request }) => {
        const input = (await request.json()) as { version: number; body: string }
        sent.push(input)
        return HttpResponse.json({
          ...draft,
          title: (input as { title?: string }).title ?? draft.title,
          body: input.body,
          version: input.version + 1,
        })
      }),
    )
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.update(await screen.findByLabelText('Title'), 'New title')
    await fireEvent.focusOut(screen.getByLabelText('Title'))
    await screen.findByText('Saved')
    await fireEvent.update(screen.getByLabelText('Title'), 'Newer title')
    await fireEvent.focusOut(screen.getByLabelText('Title'))
    await waitFor(() => expect(sent.map((s) => s.version)).toEqual([1, 2]))
  })

  it('says to reload when a save is refused as out of date, and keeps what was typed', async () => {
    mockEditor(() => HttpResponse.json({}))
    server.use(
      http.put('*/api/publications/p1/drafts/d1', () =>
        HttpResponse.json({ error: 'This draft has been saved somewhere else.' }, { status: 409 }),
      ),
    )
    await renderAt('/p/p1/drafts/d1')
    const title = await screen.findByLabelText('Title')
    await fireEvent.update(title, 'My careful rewrite')
    await fireEvent.focusOut(title)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/saved somewhere else.*reload the page/)
    expect(alert).toHaveClass('callout-danger')
    expect(alert.querySelector('svg')).not.toBeNull() // words and an icon, never colour alone
    expect(title).toHaveValue('My careful rewrite')
    expect(screen.queryByText("Couldn't save")).toBeNull()
  })
})

describe('drafts save themselves', () => {
  /** A server that keeps drafts; `failing` makes saves fail like a lost connection. */
  function serve() {
    const sent: { title: string; version: number }[] = []
    const state = { failing: false }
    mockEditor(() => HttpResponse.json({}))
    server.use(
      http.put('*/api/publications/p1/drafts/d1', async ({ request }) => {
        if (state.failing) return HttpResponse.json({ error: 'Offline' }, { status: 500 })
        const input = (await request.json()) as { title: string; version: number }
        sent.push(input)
        return HttpResponse.json({ ...draft, title: input.title, version: input.version + 1 })
      }),
    )
    return { sent, state }
  }

  it('has no Save button, and sends nothing for a draft that was only opened', async () => {
    const { sent } = serve()
    await renderAt('/p/p1/drafts/d1')
    await screen.findByLabelText('Title')
    await new Promise((resolve) => setTimeout(resolve, 2500))
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(sent).toEqual([])
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('saves a couple of seconds after typing stops, saying what it is doing', async () => {
    const { sent } = serve()
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.update(await screen.findByLabelText('Title'), 'Typed title')
    expect(screen.getByText('Not saved yet')).toBeTruthy()
    expect(sent).toEqual([])
    await screen.findByText('Saved', {}, { timeout: 5000 })
    expect(sent).toEqual([{ title: 'Typed title', body: 'Some text', version: 1 }])
  })

  it('saves at once on Ctrl+S', async () => {
    const { sent } = serve()
    await renderAt('/p/p1/drafts/d1')
    const title = await screen.findByLabelText('Title')
    await fireEvent.update(title, 'Quick title')
    await fireEvent.keyDown(title, { key: 's', ctrlKey: true })
    await screen.findByText('Saved')
    expect(sent).toHaveLength(1)
  })

  it('keeps the words and offers Try again when a save fails; the callout goes once it works', async () => {
    const { state } = serve()
    state.failing = true
    await renderAt('/p/p1/drafts/d1')
    const title = await screen.findByLabelText('Title')
    await fireEvent.update(title, 'Precious words')
    await fireEvent.focusOut(title)
    await screen.findByText('Not saved yet') // retrying quietly, words kept
    expect(title).toHaveValue('Precious words')
    expect(screen.queryByRole('alert')).toBeNull()
  }, 20_000)

  it('Try again sends the words once the connection is back', async () => {
    const { sent, state } = serve()
    state.failing = true
    await renderAt('/p/p1/drafts/d1')
    const title = await screen.findByLabelText('Title')
    await fireEvent.update(title, 'Precious words')
    // Retries wait 4, 8 and 16 seconds, so it is quicker to wait for the end of them than to fake the clock under msw.
    const alert = (await screen.findByText(/couldn’t save that/, {}, { timeout: 40_000 })).closest(
      '[role=alert]',
    ) as HTMLElement
    expect(alert).toHaveClass('callout-danger')
    expect(alert.querySelector('svg')).not.toBeNull()
    expect(alert).toHaveTextContent(/couldn’t save that.*Your words are still here/)
    expect(title).toHaveValue('Precious words')
    state.failing = false
    await fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    await screen.findByText('Saved')
    expect(alert).not.toBeInTheDocument()
    expect(sent.map((s) => s.title)).toEqual(['Precious words'])
  }, 60_000)

  it('is not offered to someone who cannot change the draft', async () => {
    mockEditor(() => HttpResponse.json({}))
    server.use(
      http.get('*/api/publications/p1/drafts/d1', () => HttpResponse.json(bobsDraftForAutosave)),
    )
    await renderAt('/p/p1/drafts/d1')
    await screen.findByTestId('read-only')
    expect(screen.queryByText('Not saved yet')).toBeNull()
    expect(screen.queryByText('Saved')).toBeNull()
  })
})
const bobsDraftForAutosave = { ...draft, editorId: 'u2', editorName: 'Bob Jones' }
