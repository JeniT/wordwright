import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import type { Editor } from '@tiptap/vue-3'
import { ONE_PARAGRAPH } from '@wordwright/core'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer({ warm: ['draft'] })

const BODY =
  'The river bends because the outside bank erodes faster.\n\nIt drifts across the valley.'
const draft = {
  id: 'd1',
  publicationId: 'p1',
  ideaId: 'i1',
  title: 'T',
  body: BODY,
  editorId: 'u1',
  editorName: 'Ada Lovelace',
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

/** The draft's page for its editor (or, with `viewer`, someone else), recording what is saved and recorded. */
function mockDraft(viewer = testUser, over: Partial<typeof draft> = {}) {
  const current = { ...draft, ...over }
  const saved: { title: string; body: string; version: number }[] = []
  const recorded: Record<string, unknown>[] = []
  const asked: Record<string, unknown>[] = []
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
        links: [],
        drafts: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
    ),
    http.get('*/api/publications/p1/drafts/d1', () => HttpResponse.json(current)),
    http.put('*/api/publications/p1/drafts/d1', async ({ request }) => {
      const body = (await request.json()) as { title: string; body: string; version: number }
      saved.push(body)
      return HttpResponse.json({ ...current, ...body, version: body.version + 1 })
    }),
    http.post('*/api/publications/p1/assist/rephrase', async ({ request }) => {
      asked.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({
        size: 'short',
        options: [
          'The river curves as its outer bank wears away.',
          'Rivers bend; outer banks erode.',
          'Erosion on the outside is what bends a river.',
          'A river bends where the outside bank gives way.',
          'The outer bank erodes, so the river bends.',
        ],
      })
    }),
    http.post('*/api/publications/p1/drafts/d1/option-insertions', async ({ request }) => {
      recorded.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json(
        {
          id: 'x1',
          text: 'x',
          origin: 'option',
          option: { kind: 'passage', offered: 'o', aim: 'a' },
          noteAuthorName: null,
          insertedByName: 'Ada',
          insertedAt: '2026-01-02T00:00:00Z',
          source: null,
        },
        { status: 201 },
      )
    }),
  )
  return { saved, recorded, asked }
}

/** Selects text in the editor the way a pointer would, through the editor itself (jsdom has no selection UI). */
async function select(from: number, to: number) {
  const dom = await waitFor(() => {
    const el = document.querySelector('.ProseMirror') as (HTMLElement & { editor?: Editor }) | null
    if (!el?.editor) throw new Error('editor not ready')
    return el
  })
  dom.editor!.commands.setTextSelection({ from, to })
}
const rephraseButton = () => screen.findByRole('button', { name: 'Rephrase' })
const editorText = () => document.querySelector('.ProseMirror')!.textContent

describe('EditorView: Rephrase', () => {
  it('is disabled, and says why, until some words are selected', async () => {
    mockDraft()
    await renderAt('/p/p1/drafts/d1')
    const button = await rephraseButton()
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(/Select some of your draft to rephrase it/)
  })

  it('is enabled for words inside one paragraph, and says what it is for', async () => {
    mockDraft()
    await renderAt('/p/p1/drafts/d1')
    await select(5, 40) // "river bends because the outside bank"
    await waitFor(async () => expect(await rephraseButton()).toBeEnabled())
    // Nothing blocks it, so no hint; what it is for is behind the info icon.
    expect(await rephraseButton()).not.toHaveAccessibleDescription()
    expect(screen.getByRole('button', { name: 'About rephrasing' })).toHaveAccessibleDescription(
      /different ways to put your words/,
    )
  })

  it('is disabled for a selection across paragraphs, or too small, with what to do', async () => {
    mockDraft()
    await renderAt('/p/p1/drafts/d1')
    await select(5, 80) // into the second paragraph
    await waitFor(async () => expect(await rephraseButton()).toBeDisabled())
    expect(await rephraseButton()).toHaveAccessibleDescription(new RegExp(ONE_PARAGRAPH))
    await select(5, 12)
    await waitFor(async () =>
      expect(await rephraseButton()).toHaveAccessibleDescription(/at least 5 words/),
    )
  })

  it('opens on the selected words, and replaces exactly them with the chosen option, then saves and records it', async () => {
    const { saved, recorded, asked } = mockDraft()
    await renderAt('/p/p1/drafts/d1')
    await select(1, 56) // the whole first sentence
    await waitFor(async () => expect(await rephraseButton()).toBeEnabled())
    await fireEvent.click(await rephraseButton())

    const dialog = await screen.findByRole('dialog', { name: 'Rephrase this passage' })
    const wording = within(dialog).getByLabelText('Current wording') as HTMLTextAreaElement
    expect(wording.value).toBe('The river bends because the outside bank erodes faster.')
    await fireEvent.update(
      within(dialog).getByLabelText('What should it do?'),
      'Shorter and plainer',
    )
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Generate options' }))
    await within(dialog).findByRole('list', { name: 'Options' })
    expect(asked[0]).toMatchObject({ draftId: 'd1', kind: 'passage', aim: 'Shorter and plainer' })
    expect(saved.length).toBeGreaterThan(0) // the AI reads the saved draft

    await fireEvent.click(
      within(dialog).getByRole('button', { name: /Replace the wording with option 5/ }),
    )
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Use this' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    expect(editorText()).toContain('The outer bank erodes, so the river bends.')
    expect(editorText()).not.toContain('outside bank erodes faster')
    expect(editorText()).toContain('It drifts across the valley.')
    await waitFor(() => expect(recorded).toHaveLength(1))
    expect(recorded[0]).toEqual({
      kind: 'passage',
      offered: 'The outer bank erodes, so the river bends.',
      text: 'The outer bank erodes, so the river bends.',
      aim: 'Shorter and plainer',
    })
    expect(saved.at(-1)!.body).toContain('The outer bank erodes, so the river bends.')
  })

  it('records nothing when the writer uses their own words', async () => {
    const { saved, recorded } = mockDraft()
    await renderAt('/p/p1/drafts/d1')
    await select(5, 40)
    await waitFor(async () => expect(await rephraseButton()).toBeEnabled())
    await fireEvent.click(await rephraseButton())
    const dialog = await screen.findByRole('dialog')
    await fireEvent.update(
      within(dialog).getByLabelText('Current wording'),
      'rivers wander as banks wear away',
    )
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Use this' }))
    await waitFor(() => expect(saved.length).toBeGreaterThan(0))
    expect(editorText()).toContain('rivers wander as banks wear away')
    expect(recorded).toEqual([])
  })

  it('changes nothing when the window is cancelled', async () => {
    const { saved, recorded } = mockDraft()
    await renderAt('/p/p1/drafts/d1')
    await select(5, 40)
    await waitFor(async () => expect(await rephraseButton()).toBeEnabled())
    ;(await rephraseButton()).focus() // a click focuses the button in a browser; jsdom's does not
    await fireEvent.click(await rephraseButton())
    await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(editorText()).toContain('The river bends because the outside bank erodes faster.')
    expect(saved).toEqual([])
    expect(recorded).toEqual([])
    await waitFor(() => expect(rephraseButton()).resolves.toHaveFocus())
  })

  it('replaces nothing, and says so, if the draft was changed under the window', async () => {
    const { saved, recorded } = mockDraft()
    await renderAt('/p/p1/drafts/d1')
    await select(1, 56)
    await waitFor(async () => expect(await rephraseButton()).toBeEnabled())
    await fireEvent.click(await rephraseButton())
    const dialog = await screen.findByRole('dialog')
    await fireEvent.update(
      within(dialog).getByLabelText('Current wording'),
      'rivers wander as banks wear away',
    )
    // The text is replaced from elsewhere while the window is open (as a refetch would), so the range now means other words.
    const editor = (document.querySelector('.ProseMirror') as HTMLElement & { editor: Editor })
      .editor
    editor.commands.setContent('Entirely different words now, and a good many of them too.')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Use this' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('changed while the window was open')
    expect(editorText()).toContain('Entirely different words now')
    expect(editorText()).not.toContain('rivers wander')
    expect(recorded).toEqual([])
    expect(saved.at(-1)?.body ?? '').not.toContain('rivers wander')
  })

  describe('formatting in the words replaced', () => {
    /** Opens the window on the first sentence (positions 1 to 56) and replaces it with `words`. */
    async function replaceFirstSentence(words: string) {
      await select(1, 56)
      await waitFor(async () => expect(await rephraseButton()).toBeEnabled())
      await fireEvent.click(await rephraseButton())
      const dialog = await screen.findByRole('dialog')
      return {
        dialog,
        use: async () => {
          await fireEvent.update(within(dialog).getByLabelText('Current wording'), words)
          await fireEvent.click(within(dialog).getByRole('button', { name: 'Use this' }))
          await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        },
      }
    }
    const firstParagraphHtml = () => document.querySelector('.ProseMirror p')!.innerHTML

    it('keeps formatting that covers all of the words', async () => {
      const { saved } = mockDraft(testUser, {
        body: '*The river bends because the outside bank erodes faster.*\n\nIt drifts across the valley.',
      })
      await renderAt('/p/p1/drafts/d1')
      const { dialog, use } = await replaceFirstSentence('Rivers wander as banks wear away.')
      expect(within(dialog).queryByText(/others aren’t/)).toBeNull()
      await use()
      expect(firstParagraphHtml()).toBe('<em>Rivers wander as banks wear away.</em>')
      await waitFor(async () => expect(await rephraseButton()).toBeDisabled()) // the cursor follows them; nothing is selected
      await waitFor(() =>
        expect(saved.at(-1)?.body).toContain('*Rivers wander as banks wear away.*'),
      )
    })

    it('ignores a space beside formatted words', async () => {
      mockDraft(testUser, {
        body: '*The river bends because the outside bank erodes faster.* It drifts.\n\nIt drifts across the valley.',
      })
      await renderAt('/p/p1/drafts/d1')
      await select(1, 57) // the sentence and the space after it
      await waitFor(async () => expect(await rephraseButton()).toBeEnabled())
      await fireEvent.click(await rephraseButton())
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).queryByText(/others aren’t/)).toBeNull()
    })

    it('keeps a link that covers all of the words', async () => {
      mockDraft(testUser, {
        body: '[The river bends because the outside bank erodes faster.](https://example.com/rivers)\n\nIt drifts across the valley.',
      })
      await renderAt('/p/p1/drafts/d1')
      const { use } = await replaceFirstSentence('Rivers wander as banks wear away.')
      await use()
      const link = document.querySelector('.ProseMirror p a') as HTMLAnchorElement
      expect(link.getAttribute('href')).toBe('https://example.com/rivers')
      expect(link.textContent).toBe('Rivers wander as banks wear away.')
    })

    it('says before it is used that mixed formatting will be lost, then replaces it with plain words', async () => {
      mockDraft(testUser, {
        body: '**The river** bends because the outside bank erodes faster.\n\nIt drifts across the valley.',
      })
      await renderAt('/p/p1/drafts/d1')
      const { dialog, use } = await replaceFirstSentence('Rivers wander as banks wear away.')
      expect(within(dialog).getByText(/others aren’t/)).toBeInTheDocument()
      await use()
      expect(firstParagraphHtml()).toBe('Rivers wander as banks wear away.')
    })
  })

  describe('in Markdown mode', () => {
    afterEach(() => localStorage.removeItem('wordwright:draft-markdown-mode'))

    it('replaces the selected Markdown', async () => {
      localStorage.setItem('wordwright:draft-markdown-mode', 'true')
      const { saved } = mockDraft(testUser, {
        body: 'The river **bends** because the bank erodes.',
      })
      await renderAt('/p/p1/drafts/d1')
      const box = (await screen.findByRole('textbox', {
        name: 'Draft body, as Markdown',
      })) as HTMLTextAreaElement
      await waitFor(() => expect(box.value).toContain('river **bends**'))
      box.setSelectionRange(0, box.value.length)
      await fireEvent.select(box)
      await waitFor(async () => expect(await rephraseButton()).toBeEnabled())
      await fireEvent.click(await rephraseButton())
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByLabelText('Current wording')).toHaveValue(
        'The river **bends** because the bank erodes.',
      )
      await fireEvent.update(
        within(dialog).getByLabelText('Current wording'),
        'Rivers wander as banks wear away.',
      )
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Use this' }))
      await waitFor(() => expect(box.value).toBe('Rivers wander as banks wear away.'))
      await waitFor(() => expect(saved.at(-1)?.body).toBe('Rivers wander as banks wear away.'))
    })

    it('says in place of the comments that they cannot be shown', async () => {
      localStorage.setItem('wordwright:draft-markdown-mode', 'true')
      mockDraft()
      await renderAt('/p/p1/drafts/d1')
      await fireEvent.click(await screen.findByRole('tab', { name: /^Comments/ }))
      expect(
        await screen.findByText(
          'Comments are hidden while you edit Markdown. Switch back to see them.',
        ),
      ).toBeInTheDocument()
    })
  })

  it('is not offered to someone who cannot change the draft', async () => {
    mockDraft({ ...testUser, id: 'u2', name: 'Bob Jones', email: 'bob@example.com', handle: 'bob' })
    await renderAt('/p/p1/drafts/d1')
    await screen.findByTestId('read-only')
    expect(screen.queryByRole('button', { name: 'Rephrase' })).toBeNull()
  })

  describe('the title', () => {
    /** Enough words for title options to come from: the configured minimum, and a few more. */
    const LONG = Array.from({ length: 320 }, (_, i) => `word${i}`).join(' ')
    const titleButton = () => screen.findByRole('button', { name: 'Rephrase title' })

    it('waits for a longer draft, and says so', async () => {
      mockDraft()
      await renderAt('/p/p1/drafts/d1')
      const button = await titleButton()
      expect(button).toBeDisabled()
      expect(button).toHaveAccessibleDescription(
        'Write at least 300 words first. Options for a title come from your draft.',
      )
    })

    it('is not offered to someone who cannot change the draft', async () => {
      mockDraft(
        { ...testUser, id: 'u2', name: 'Bob Jones', email: 'bob@example.com', handle: 'bob' },
        { body: LONG },
      )
      await renderAt('/p/p1/drafts/d1')
      await screen.findByTestId('read-only')
      expect(screen.queryByRole('button', { name: 'Rephrase title' })).toBeNull()
    })

    it('asks about the title with no selection, sets the title from the chosen option, saves and records it', async () => {
      const { saved, recorded, asked } = mockDraft(testUser, { body: LONG })
      await renderAt('/p/p1/drafts/d1')
      await waitFor(async () => expect(await titleButton()).toBeEnabled())
      await fireEvent.click(await titleButton())

      const dialog = await screen.findByRole('dialog', { name: 'Rephrase the title' })
      expect((within(dialog).getByLabelText('Current wording') as HTMLTextAreaElement).value).toBe(
        'T',
      )
      await fireEvent.update(
        within(dialog).getByLabelText('What should it do?'),
        'Plainer and more curious',
      )
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Generate options' }))
      await within(dialog).findByRole('list', { name: 'Options' })
      expect(asked[0]).toMatchObject({ draftId: 'd1', kind: 'title', wording: 'T' })

      await fireEvent.click(
        within(dialog).getByRole('button', { name: /Replace the wording with option 2/ }),
      )
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Use this' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

      expect(screen.getByLabelText('Title', { selector: 'input' })).toHaveValue(
        'Rivers bend; outer banks erode.',
      )
      await waitFor(() => expect(recorded).toHaveLength(1))
      expect(recorded[0]).toEqual({
        kind: 'title',
        offered: 'Rivers bend; outer banks erode.',
        text: 'Rivers bend; outer banks erode.',
        aim: 'Plainer and more curious',
      })
      expect(saved.at(-1)!.title).toBe('Rivers bend; outer banks erode.')
    })

    it('leaves the title alone, and returns to the button, when cancelled', async () => {
      const { saved, recorded } = mockDraft(testUser, { body: LONG })
      await renderAt('/p/p1/drafts/d1')
      await waitFor(async () => expect(await titleButton()).toBeEnabled())
      ;(await titleButton()).focus()
      await fireEvent.click(await titleButton())
      await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
      expect(screen.getByLabelText('Title', { selector: 'input' })).toHaveValue('T')
      expect(saved).toEqual([])
      expect(recorded).toEqual([])
      await waitFor(() => expect(titleButton()).resolves.toHaveFocus())
    })
  })
})
