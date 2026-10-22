import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { BrainstormEvent, ConversationMessage, Proposal, RecordedNote } from '@wordwright/core'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const idea = {
  id: 'i1',
  publicationId: 'ada-substack',
  name: 'Why rivers meander',
  notes: 'Erosion loops.\nSecond line.',
  links: [
    {
      id: 'l1',
      url: 'https://example.org/paper',
      title: 'A paper',
      readAt: null,
      origin: 'entered',
    },
  ],
  drafts: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
}
const conversationsUrl = '*/api/publications/ada-substack/ideas/i1/conversations'
const conversationUrl = `${conversationsUrl}/c1`
const summary = (
  id: string,
  startedByName: string | null = 'Ada',
  createdAt = '2026-01-05T10:00:00Z',
  title: string | null = null,
  titleByAi = false,
) => ({
  id,
  createdAt,
  startedByName,
  title,
  titleByAi,
})
const page = '/p/ada-substack/ideas/i1/brainstorm'

let counter = 0
const userMessage = (
  text: string,
  overrides: Partial<ConversationMessage> = {},
): ConversationMessage => ({
  id: `u${++counter}`,
  role: 'user',
  kind: 'message',
  text,
  authorName: 'Ada',
  model: null,
  status: 'complete',
  stopReason: null,
  proposals: [],
  notes: [],
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
})
const kickoff = () => userMessage('', { kind: 'kickoff' })
const aiMessage = (
  text: string,
  overrides: Partial<ConversationMessage> = {},
): ConversationMessage => ({
  ...userMessage(text),
  id: `a${++counter}`,
  role: 'assistant',
  authorName: null,
  model: 'claude-sonnet-5-5',
  stopReason: 'end',
  ...overrides,
})
const recorded = (overrides: Partial<RecordedNote> = {}): RecordedNote => ({
  id: `n${++counter}`,
  text: 'Meanders speed up erosion.',
  outcome: 'added',
  removed: false,
  ...overrides,
})
const proposal = (overrides: Partial<Proposal> = {}): Proposal => ({
  id: `p${++counter}`,
  tool: 'update_idea',
  input: { name: 'Why rivers loop' },
  reading: null,
  status: 'pending',
  stale: false,
  createdIdeaId: null,
  decidedByName: null,
  decidedAt: null,
  edited: false,
  ...overrides,
})

/** A server-sent event stream, delivered as the real API does. */
const sse = (events: BrainstormEvent[]) =>
  new HttpResponse(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        for (const e of events) {
          controller.enqueue(encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`))
        }
        controller.close()
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )
const words = (text: string): BrainstormEvent[] =>
  (text.match(/\S+\s*/g) ?? []).map((t) => ({ type: 'text', text: t }))

interface Server {
  /** Whether the idea has its (one) conversation yet; it is made when the first is started. */
  exists: boolean
  messages: ConversationMessage[]
  replyingNow: { name: string } | null
  posts: unknown[]
  /** What the next POST answers; by default the AI replies "Noted." and the exchange is saved. */
  respond: (body: Record<string, unknown>) => Response
}

/** A pretend API that keeps the thread, so that what the page re-reads after a reply is what was streamed. */
function mockConversation(
  initial: ConversationMessage[] = [],
  extra: Parameters<typeof server.use> = [],
) {
  const state: Server = {
    exists: initial.length > 0,
    messages: [...initial],
    replyingNow: null,
    posts: [],
    respond: (body) => {
      const sent = body.start ? kickoff() : userMessage(String(body.text ?? ''))
      const reply = aiMessage('Noted.')
      if (!body.retry) state.messages.push(sent)
      state.messages.push(reply)
      return sse([
        ...(body.retry ? [] : [{ type: 'message' as const, message: sent }]),
        ...words('Noted.'),
        { type: 'done', message: reply },
      ])
    },
  }
  server.use(
    signedInAs(testUser),
    // Overrides come first: the first matching handler wins.
    ...extra,
    http.get('*/api/publications', () => HttpResponse.json([])),
    http.get('*/api/publications/ada-substack/ideas/i1', () => HttpResponse.json(idea)),
    http.get(conversationsUrl, () =>
      HttpResponse.json({ conversations: state.exists ? [summary('c1')] : [] }),
    ),
    http.post(conversationsUrl, () => {
      state.exists = true
      return HttpResponse.json(summary('c1'), { status: 201 })
    }),
    http.get(conversationUrl, () =>
      HttpResponse.json({
        ...summary('c1'),
        messages: state.messages,
        replyingNow: state.replyingNow,
      }),
    ),
    http.post(`${conversationUrl}/messages`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      state.posts.push(body)
      return state.respond(body)
    }),
  )
  return state
}

const type = async (text: string) => {
  await fireEvent.update(await screen.findByLabelText('Your message'), text)
}
const sendWithKeyboard = async () =>
  fireEvent.keyDown(screen.getByLabelText('Your message'), { key: 'Enter', ctrlKey: true })

describe('the brainstorm page', () => {
  it('shows the idea and who sees what, and invites a start when there is no conversation', async () => {
    mockConversation()
    await renderAt(page)
    expect(await screen.findByRole('heading', { name: 'Refine' })).toBeInTheDocument()
    // On your own, nothing is shared, so there is nothing to warn about.
    expect(screen.queryByTestId('shared-thread-notice')).toBeNull()

    // The page does not repeat the idea back: its notes are a click away in the menu.
    expect(screen.queryByText('The idea')).toBeNull()
    expect(screen.queryByText(/Erosion loops/)).toBeNull()

    expect(await screen.findByRole('button', { name: 'Refine with your AI' })).toBeInTheDocument()
    // What leaves the system is said beside the button, in one line; the page says nothing else about it.
    expect(
      screen.getByText(
        /^This will send this publication’s description and this idea’s title and notes and reading list to your AI\. It will not send your drafts\.$/,
      ),
    ).toBeVisible()
    expect(screen.queryByLabelText('Your message')).toBeNull() // nothing to answer yet
  })

  it('says plainly that a thread is shared, before the first brainstorm, when others are in the publication', async () => {
    mockConversation(
      [],
      [
        http.get('*/api/publications', () =>
          HttpResponse.json([
            {
              id: 'ada-substack',
              name: 'Ada',
              siteUrl: null,
              imageUrl: null,
              siteIconUrl: null,
              description: null,
              role: 'owner',
              members: [
                {
                  userId: 'u1',
                  name: 'Ada',
                  handle: 'ada',
                  email: 'ada@example.com',
                  role: 'owner',
                },
                {
                  userId: 'u2',
                  name: 'Bo',
                  handle: 'bouser',
                  email: 'bo@example.com',
                  role: 'member',
                },
              ],
            },
          ]),
        ),
      ],
    )
    await renderAt(page)
    const notice = await screen.findByTestId('shared-thread-notice')
    expect(notice).toHaveTextContent(/Everyone in this publication can read this conversation/)
    expect(notice).toHaveTextContent(/sent to the AI provider of whoever writes each message/)
    expect(notice).toHaveTextContent(/publication with no other members/)
    // It is there before the conversation has begun.
    expect(await screen.findByRole('button', { name: 'Refine with your AI' })).toBeInTheDocument()
  })

  it('has one way on to writing, the next step, rather than a second button beside Send', async () => {
    mockConversation([kickoff(), aiMessage('What is the claim?')])
    await renderAt(page)
    await screen.findByText('What is the claim?')
    expect(screen.queryByRole('link', { name: /I have enough/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Next: 05 Draft' })).toHaveAttribute(
      'href',
      '/p/ada-substack/ideas/i1/drafts',
    )
  })

  it('says beside Send that the idea is sent again, and that drafts never are', async () => {
    mockConversation([kickoff(), aiMessage('What is the claim?')])
    await renderAt(page)
    await screen.findByText('What is the claim?')
    const send = screen.getByRole('button', { name: 'Send' })
    const note = screen.getByText(
      /^This will re-send up-to-date information about the idea’s title, notes and reading list to your AI\. It will not send your drafts\.$/,
    )
    expect(note.parentElement).toBe(send.parentElement)
  })

  it('starts when asked, streaming the first questions, and then holds the saved exchange', async () => {
    const api = mockConversation()
    api.respond = () => {
      const sent = kickoff()
      const reply = aiMessage('What is the **one** claim?')
      api.messages.push(sent, reply)
      return sse([
        { type: 'message', message: sent },
        ...words('What is the **one** claim?'),
        { type: 'done', message: reply },
      ])
    }
    await renderAt(page)
    await fireEvent.click(await screen.findByRole('button', { name: 'Refine with your AI' }))

    await screen.findByText(/What is the/)
    expect(screen.queryByText(/Refine started/)).toBeNull() // the opening turn is the app's own
    // The bold only appears once its closing ** has arrived (and the live text is swapped for the saved message).
    await waitFor(() => expect(document.querySelector('.markdown strong')).toHaveTextContent('one'))
    expect(api.posts).toEqual([{ start: true }])
    await waitFor(() => expect(screen.getByLabelText('Your message')).toBeEnabled())
    expect(screen.queryByRole('button', { name: 'Refine with your AI' })).toBeNull()
  })

  it('never shows your AI’s reply twice while the rest of the page catches up', async () => {
    // The thread is re-read, then the idea and its notes. While those are still on their way the
    // saved reply is already in the thread, and the streamed copy must not be shown beside it.
    let hold = false
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    mockConversation(
      [kickoff(), aiMessage('What is the claim?')],
      [
        http.get('*/api/publications/ada-substack/ideas/i1', async () => {
          if (hold) await held
          return HttpResponse.json(idea)
        }),
      ],
    )
    await renderAt(page)
    await type('Hello')
    hold = true
    await sendWithKeyboard()
    await screen.findByText('Hello')
    // Once the saved thread has the reply the page can only have one copy of it.
    await waitFor(() => expect(screen.queryByText('Thinking…')).toBeNull())
    await new Promise((resolve) => setTimeout(resolve, 150)) // let the thread be re-read
    expect(screen.getAllByText('Noted.')).toHaveLength(1)
    expect(screen.getByLabelText('Your message')).toBeDisabled() // still finishing up
    release()
    await waitFor(() => expect(screen.getByLabelText('Your message')).toBeEnabled())
    expect(screen.getAllByText('Noted.')).toHaveLength(1)
  })

  it('starts by itself when sent here from the idea page (?start=1), once, and not again on reload', async () => {
    const api = mockConversation()
    const { router } = await renderAt(`${page}?start=1`)
    await waitFor(() => expect(api.posts).toEqual([{ start: true }]))
    expect(screen.queryByText(/Refine started/)).toBeNull()
    await waitFor(() => expect(router.currentRoute.value.query).toEqual({}))
  })

  it('does not start a second conversation when one exists', async () => {
    const api = mockConversation([kickoff(), aiMessage('Hello.')])
    await renderAt(`${page}?start=1`)
    await screen.findByText('Hello.')
    expect(api.posts).toEqual([])
  })

  it('sends what is typed with Ctrl+Enter, shows who said it, and renders the reply safely', async () => {
    const api = mockConversation([kickoff(), aiMessage('Go on.')])
    api.respond = (body) => {
      const sent = userMessage(String(body.text))
      const reply = aiMessage('Good. <img src=x onerror=alert(1)> **Strong** point.')
      api.messages.push(sent, reply)
      return sse([
        { type: 'message', message: sent },
        ...words(reply.text),
        { type: 'done', message: reply },
      ])
    }
    await renderAt(page)
    await screen.findByText('Go on.')
    const send = screen.getByRole('button', { name: 'Send' })
    expect(send).toBeDisabled() // nothing typed
    await type('It is about erosion.')
    expect(send).toBeEnabled()
    await sendWithKeyboard()

    expect(await screen.findByText('It is about erosion.')).toBeInTheDocument()
    expect(api.posts).toEqual([{ text: 'It is about erosion.' }])
    expect(screen.getByLabelText('Your message')).toHaveValue('')
    const reply = (await screen.findByText(/Strong/)).closest('.markdown')!
    expect(reply.querySelector('img')).toBeNull() // raw HTML never reaches the page
    expect(reply.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(reply.querySelector('strong')).toHaveTextContent('Strong')
    expect(screen.getAllByText('Ada').length).toBeGreaterThan(0)
  })

  it('does not send a message that is only spaces', async () => {
    const api = mockConversation([kickoff(), aiMessage('Go on.')])
    await renderAt(page)
    await screen.findByText('Go on.')
    await type('   ')
    await sendWithKeyboard()
    expect(api.posts).toEqual([])
  })

  it('shows that your AI is thinking, then the words as they arrive, and can be stopped', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const api = mockConversation([kickoff(), aiMessage('Go on.')])
    api.respond = (body) => {
      const sent = userMessage(String(body.text))
      return new HttpResponse(
        new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder()
            const emit = (e: BrainstormEvent) =>
              controller.enqueue(encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`))
            emit({ type: 'message', message: sent })
            api.messages.push(sent)
            await gate
            for (const w of words('Half a thought ')) emit(w)
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      )
    }
    await renderAt(page)
    await screen.findByText('Go on.')
    await type('Tell me more')
    await sendWithKeyboard()

    expect(await screen.findByText('Thinking…')).toBeInTheDocument()
    expect(screen.getByLabelText('Your message')).toBeDisabled()
    // Send stays in its place, busy, with Stop beside it.
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled()
    release()
    expect(await screen.findByText(/Half a thought/)).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(screen.getByLabelText('Your message')).toBeEnabled())
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('aria-busy', 'false')
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
  })

  describe('when a reply fails', () => {
    it('says what happened, keeps the message, and offers to try again without resending it', async () => {
      const api = mockConversation([kickoff(), aiMessage('Go on.')])
      api.respond = (body) => {
        const sent = userMessage(String(body.text))
        api.messages.push(sent)
        return sse([
          { type: 'message', message: sent },
          {
            type: 'error',
            code: 'rate_limit',
            message:
              'Your AI provider is limiting requests for your key right now. Try again in a minute.',
          },
        ])
      }
      await renderAt(page)
      await screen.findByText('Go on.')
      await type('A hard question')
      await sendWithKeyboard()

      expect(await screen.findByRole('alert')).toHaveTextContent('limiting requests for your key')
      expect(screen.getByText('A hard question')).toBeInTheDocument()
      expect(
        await screen.findByText('Your AI didn’t reply to your last message.'),
      ).toBeInTheDocument()

      api.respond = () => {
        const reply = aiMessage('Here I am.')
        api.messages.push(reply)
        return sse([...words('Here I am.'), { type: 'done', message: reply }])
      }
      await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(await screen.findByText('Here I am.')).toBeInTheDocument()
      expect(api.posts.at(-1)).toEqual({ retry: true })
      expect(screen.queryByText('Your AI didn’t reply to your last message.')).toBeNull()
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('points to account settings when the key is missing or rejected, and puts the message back', async () => {
      const api = mockConversation([kickoff(), aiMessage('Go on.')])
      api.respond = () =>
        HttpResponse.json(
          { error: 'Add your Anthropic API key in your account settings to use this feature' },
          { status: 409 },
        ) as unknown as Response
      await renderAt(page)
      await screen.findByText('Go on.')
      await type('Please answer')
      await sendWithKeyboard()

      expect(await screen.findByRole('alert')).toHaveTextContent('Your AI needs your key first.')
      expect(screen.getByRole('link', { name: 'Add your AI key' })).toHaveAttribute(
        'href',
        '/account/ai',
      )
      expect(screen.getByLabelText('Your message')).toHaveValue('Please answer') // not lost
    })

    it('says the provider refused the key, and where to check it, with an icon beside the words', async () => {
      const api = mockConversation([kickoff(), aiMessage('Go on.')])
      api.respond = () =>
        sse([
          { type: 'message', message: userMessage('Please answer') },
          { type: 'error', code: 'auth', message: 'The provider said no.' },
        ])
      await renderAt(page)
      await screen.findByText('Go on.')
      await type('Please answer')
      await sendWithKeyboard()

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Your AI provider didn’t accept your key. Check it in')
      expect(alert.querySelector('svg')).not.toBeNull()
      expect(within(alert).getByRole('link', { name: 'your AI key settings' })).toHaveAttribute(
        'href',
        '/account/ai',
      )
    })

    it('says so when it was too many messages, or someone else is mid-reply', async () => {
      const api = mockConversation([kickoff(), aiMessage('Go on.')])
      api.respond = () =>
        HttpResponse.json(
          { error: 'Bob is waiting for a reply. Try again in a moment.' },
          { status: 409 },
        ) as unknown as Response
      await renderAt(page)
      await screen.findByText('Go on.')
      await type('Hello?')
      await sendWithKeyboard()
      expect(await screen.findByRole('alert')).toHaveTextContent('Bob is waiting for a reply')
      expect(screen.queryByRole('link', { name: 'Add your AI key' })).toBeNull()
      expect(screen.queryByRole('link', { name: 'your AI key settings' })).toBeNull()
    })
  })

  it('shows when someone else is waiting for a reply, and does not let a second message be sent', async () => {
    const api = mockConversation([
      kickoff(),
      aiMessage('Go on.'),
      userMessage('Bob here', { authorName: 'Bob' }),
    ])
    api.replyingNow = { name: 'Bob' }
    await renderAt(page)
    expect(await screen.findByText('Bob is waiting for a reply…')).toBeInTheDocument()
    expect(screen.getByLabelText('Your message')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(screen.queryByText('Your AI didn’t reply to your last message.')).toBeNull()
  })

  it('names the sender of each message, and says when it was cut short, stopped or declined', async () => {
    mockConversation([
      kickoff(),
      aiMessage('Long answer', { stopReason: 'max_tokens' }),
      userMessage('Hm', { authorName: 'Bob' }),
      aiMessage('Partly', { status: 'stopped', stopReason: null }),
      userMessage('Rude question', { authorName: null }),
      aiMessage('', { stopReason: 'refusal' }),
    ])
    await renderAt(page)
    expect(await screen.findByText('Bob')).toHaveClass('rounded-full') // a name chip, as on a note
    expect(screen.getByText('A former member')).toHaveClass('rounded-full') // an account that has gone
    expect(screen.queryByText('Someone')).toBeNull()
    expect(screen.getByText(/This reply was cut short/)).toBeInTheDocument()
    expect(screen.getByText('The reply was stopped here.')).toBeInTheDocument()
    expect(screen.getByText(/declined to answer that/)).toBeInTheDocument()
    expect(screen.queryByText(/claude-sonnet-5-5/)).toBeNull() // which model replied is not shown
  })

  describe('notes the AI records', () => {
    it('are listed under its message, saying what became of each', async () => {
      mockConversation([
        kickoff(),
        aiMessage('I have noted these.', {
          notes: [
            recorded({ text: 'Meanders speed up erosion.' }),
            recorded({ text: 'Erosion loops.', outcome: 'duplicate' }),
            recorded({ text: 'Too many.', outcome: 'full' }),
            recorded({ text: 'Changed my mind.', removed: true }),
          ],
        }),
      ])
      await renderAt(page)
      const list = await screen.findByRole('list', { name: 'Notes recorded in this reply' })
      const lines = within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent!.replace(/\s+/g, ' ').replace('📝', '').trim())
      expect(lines).toEqual([
        'Added to your notes: “Meanders speed up erosion.”',
        'Already in your notes: “Erosion loops.”',
        "Couldn't add (this idea has as many notes as it can hold): “Too many.”",
        'Noted, then deleted: “Changed my mind.”',
      ])
    })

    it('show up as the reply is saved, and the idea is read again afterwards', async () => {
      const api = mockConversation([kickoff(), aiMessage('Go on.')])
      let ideaReads = 0
      server.use(
        http.get('*/api/publications/ada-substack/ideas/i1', () => {
          ideaReads++
          return HttpResponse.json(idea)
        }),
      )
      const note = recorded({ text: 'Erosion is faster on the outside bend.' })
      api.respond = (body) => {
        const sent = userMessage(String(body.text))
        const reply = aiMessage('Good point.', { notes: [note] })
        api.messages.push(sent, reply)
        return sse([
          { type: 'message', message: sent },
          ...words('Good point.'),
          { type: 'note', note },
          { type: 'done', message: reply },
        ])
      }
      await renderAt(page)
      await screen.findByText('Go on.')
      await type('Erosion is faster on the outside bend.')
      await sendWithKeyboard()
      expect(await screen.findByText(/Added to your notes:/)).toBeInTheDocument()
      expect(screen.getByText(/“Erosion is faster on the outside bend\.”/)).toBeInTheDocument()
      await waitFor(() => expect(ideaReads).toBeGreaterThan(1))
    })

    it('are not shown for a message that recorded none', async () => {
      mockConversation([kickoff(), aiMessage('Just a question.')])
      await renderAt(page)
      await screen.findByText('Just a question.')
      expect(screen.queryByRole('list', { name: 'Notes recorded in this reply' })).toBeNull()
    })
  })

  describe('suggestions', () => {
    const withProposals = (...proposals: Proposal[]) =>
      mockConversation([kickoff(), aiMessage('Try this.', { proposals })])
    /** The server's answer to deciding on a suggestion, and the thread as it is read afterwards. */
    const decidesAs = (
      api: ReturnType<typeof mockConversation>,
      id: string,
      action: 'accept' | 'dismiss' | 'reconsider',
      changes: Partial<Proposal>,
      seen?: (body: unknown) => void,
    ) =>
      http.post(`${conversationUrl}/proposals/${id}/${action}`, async ({ request }) => {
        seen?.(await request.json())
        const message = api.messages.find((m) => m.proposals.some((p) => p.id === id))!
        message.proposals = message.proposals.map((p) => (p.id === id ? { ...p, ...changes } : p))
        return HttpResponse.json(message.proposals.find((p) => p.id === id))
      })

    it('sit above the AI’s words, outside their box, so the question is by the reply box', async () => {
      withProposals(
        proposal({ tool: 'suggest_note', input: { text: 'A point.' } }),
        proposal({ input: { name: 'Why rivers loop' } }),
      )
      await renderAt(page)
      const notes = await screen.findByRole('region', { name: 'Suggested notes' })
      const words = screen.getByText('Try this.')
      expect(notes.compareDocumentPosition(words) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(notes.closest('.panel-sunken')).toBeNull()
      expect(words.closest('.panel-sunken')).not.toBeNull()
      expect(
        within(words.closest('.panel-sunken') as HTMLElement).queryByText('A point.'),
      ).toBeNull()
      // One line says what the highlighting means.
      expect(screen.getByText('Highlighted text is what your AI suggested.')).toHaveClass('bg-mark')
    })

    it('show a new title against the current one, with edit, use and ignore', async () => {
      withProposals(proposal({ input: { name: 'Why rivers loop' } }))
      await renderAt(page)
      const row = within(await screen.findByRole('region', { name: 'Suggested ideas' }))
      expect(row.getByText('Why rivers meander')).toHaveClass('line-through') // what it replaces
      expect(row.getByText('Why rivers loop')).toHaveClass('bg-mark')
      expect(row.getByRole('button', { name: /^Edit a new title/ })).toBeInTheDocument()
      expect(
        row.getByRole('button', { name: 'Use this title: a new title, “Why rivers loop”' }),
      ).toBeInTheDocument()
      expect(row.getByRole('button', { name: /^Ignore: a new title/ })).toBeInTheDocument()
    })

    it('are used with one press, and then show who did', async () => {
      let sent: unknown
      const api = withProposals(proposal({ id: 'p-upd' }))
      server.use(
        decidesAs(
          api,
          'p-upd',
          'accept',
          { status: 'accepted', decidedByName: 'Ada' },
          (b) => (sent = b),
        ),
      )
      await renderAt(page)
      await fireEvent.click(await screen.findByRole('button', { name: /^Use this title:/ }))
      expect(await screen.findByText(/used as the title by Ada/)).toBeInTheDocument()
      expect(sent).toEqual({})
      expect(screen.queryByRole('button', { name: /^Use this title:/ })).toBeNull()
    })

    it('are ignored with one press, and brought back with another', async () => {
      const api = withProposals(proposal({ id: 'p-no' }))
      server.use(
        decidesAs(api, 'p-no', 'dismiss', { status: 'dismissed', decidedByName: 'Ada' }),
        decidesAs(api, 'p-no', 'reconsider', { status: 'pending', decidedByName: null }),
      )
      await renderAt(page)
      await fireEvent.click(await screen.findByRole('button', { name: /^Ignore:/ }))
      expect(await screen.findByText(/title ignored/)).toBeInTheDocument()
      await fireEvent.click(screen.getByRole('button', { name: /^Stop ignoring:/ }))
      expect(await screen.findByRole('button', { name: /^Use this title:/ })).toBeInTheDocument()
    })

    it('warn when the title has changed, and say "apply anyway" instead of "use this title"', async () => {
      let body: unknown
      const api = withProposals(
        proposal({ id: 'p-stale', stale: true, input: { name: 'Another title' } }),
      )
      server.use(
        decidesAs(
          api,
          'p-stale',
          'accept',
          { status: 'accepted', stale: false, decidedByName: 'Ada' },
          (b) => (body = b),
        ),
      )
      await renderAt(page)
      expect(
        await screen.findByText(/The title has changed since this was suggested/),
      ).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Use this title:/ })).toBeNull()
      await fireEvent.click(screen.getByRole('button', { name: /^Apply anyway:/ }))
      expect(await screen.findByText(/used as the title by Ada/)).toBeInTheDocument()
      expect(body).toEqual({ overwrite: true })
    })

    it('show a refusal from the server, and stay available', async () => {
      withProposals(proposal({ id: 'p-gone' }))
      server.use(
        http.post(`${conversationUrl}/proposals/p-gone/accept`, () =>
          HttpResponse.json({ error: 'This suggestion was already dismissed.' }, { status: 409 }),
        ),
      )
      await renderAt(page)
      await fireEvent.click(await screen.findByRole('button', { name: /^Use this title:/ }))
      expect(await screen.findByRole('alert')).toHaveTextContent('already dismissed')
      expect(screen.getByRole('button', { name: /^Use this title:/ })).toBeEnabled()
    })

    it('offer a new idea like an idea in a list, and link to it once created', async () => {
      withProposals(
        proposal({
          tool: 'create_idea',
          input: { name: 'Oxbow lakes', notes: 'Where meanders end.' },
        }),
        proposal({
          tool: 'create_idea',
          input: { name: 'Deltas', notes: '' },
          status: 'accepted',
          decidedByName: 'Bob',
          createdIdeaId: 'i2',
        }),
      )
      await renderAt(page)
      const list = within(await screen.findByRole('region', { name: 'Suggested ideas' }))
      expect(list.getAllByRole('listitem')).toHaveLength(2)
      expect(list.getByText('Oxbow lakes')).toHaveClass('bg-mark')
      expect(list.getByText('Where meanders end.')).toBeInTheDocument()
      expect(
        list.getByRole('button', { name: 'Create idea: a new idea, “Oxbow lakes”' }),
      ).toBeInTheDocument()
      expect(list.getByRole('link', { name: 'Open the new idea' })).toHaveAttribute(
        'href',
        '/p/ada-substack/ideas/i2/notes',
      )
      expect(list.getByText(/created by Bob/)).toBeInTheDocument()
    })

    it('let a new idea’s name and notes be edited before it is created', async () => {
      const api = withProposals(
        proposal({
          id: 'p-new',
          tool: 'create_idea',
          input: { name: 'Oxbow lakes', notes: '- a' },
        }),
      )
      const sent: unknown[] = []
      server.use(
        http.patch(`${conversationUrl}/proposals/p-new`, async ({ request }) => {
          const body = (await request.json()) as { name?: string; notes?: string }
          sent.push(body)
          api.messages[1]!.proposals = [
            proposal({
              id: 'p-new',
              tool: 'create_idea',
              input: { name: body.name ?? 'Oxbow lakes', notes: body.notes ?? '- a' },
            }),
          ]
          return HttpResponse.json(api.messages[1]!.proposals[0])
        }),
      )
      await renderAt(page)
      await fireEvent.click(await screen.findByRole('button', { name: /^Edit a new idea/ }))
      const name = screen.getByLabelText('Suggested idea')
      expect(name).toHaveFocus()
      await fireEvent.update(name, 'Cut-off meanders')
      await fireEvent.update(screen.getByLabelText('Starting notes'), '- a\n- b')
      await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(await screen.findByText('Cut-off meanders')).toBeInTheDocument()
      expect(sent).toEqual([{ name: 'Cut-off meanders', notes: '- a\n- b' }])
      expect(screen.queryByLabelText('Suggested idea')).toBeNull()
    })
  })

  describe('suggested notes', () => {
    const note = (overrides: Partial<Proposal> = {}) =>
      proposal({
        tool: 'suggest_note',
        input: { text: 'Meanders speed up erosion.' },
        ...overrides,
      })

    it('are listed with edit, add and ignore beside each, in the highlighter', async () => {
      mockConversation([kickoff(), aiMessage('Try this.', { proposals: [note({ id: 'n1' })] })])
      await renderAt(page)
      const list = within(await screen.findByRole('region', { name: 'Suggested notes' }))
      expect(list.getByText('Meanders speed up erosion.')).toHaveClass('bg-mark')
      for (const name of ['Edit suggested note', 'Add to notes', 'Ignore']) {
        expect(list.getByRole('button', { name: new RegExp(`^${name}: Meanders`) })).toBeEnabled()
      }
    })

    it('lose the highlighter once a person has edited them, as they are no longer only the AI’s words', async () => {
      mockConversation([
        kickoff(),
        aiMessage('Try this.', {
          proposals: [
            note({ id: 'n1', edited: true, input: { text: 'Reworded by a member.' } }),
            note({ id: 'n2' }),
          ],
        }),
      ])
      await renderAt(page)
      const list = within(await screen.findByRole('region', { name: 'Suggested notes' }))
      expect(list.getByText('Reworded by a member.')).not.toHaveClass('bg-mark')
      expect(list.getByText('Meanders speed up erosion.')).toHaveClass('bg-mark')
    })

    it('are added with the tick, which says who added it', async () => {
      let sent: unknown
      const api = mockConversation([
        kickoff(),
        aiMessage('Try this.', { proposals: [note({ id: 'n1' })] }),
      ])
      server.use(
        http.post(`${conversationUrl}/proposals/n1/accept`, async ({ request }) => {
          sent = await request.json()
          api.messages[1]!.proposals = [
            note({ id: 'n1', status: 'accepted', decidedByName: 'Ada' }),
          ]
          return HttpResponse.json(api.messages[1]!.proposals[0])
        }),
      )
      await renderAt(page)
      await fireEvent.click(await screen.findByRole('button', { name: /^Add to notes:/ }))
      expect(await screen.findByText(/added to the notes by Ada/)).toBeInTheDocument()
      expect(sent).toEqual({})
      expect(screen.queryByRole('button', { name: /^Add to notes:/ })).toBeNull()
    })

    it('are edited in place: the field takes focus, Save sends the edit, and focus returns', async () => {
      const api = mockConversation([
        kickoff(),
        aiMessage('Try this.', { proposals: [note({ id: 'n1' })] }),
      ])
      const sent: unknown[] = []
      server.use(
        http.patch(`${conversationUrl}/proposals/n1`, async ({ request }) => {
          const body = (await request.json()) as { text: string }
          sent.push(body)
          api.messages[1]!.proposals = [
            note({ id: 'n1', input: { text: body.text }, edited: true }),
          ]
          return HttpResponse.json(api.messages[1]!.proposals[0])
        }),
      )
      await renderAt(page)
      await fireEvent.click(await screen.findByRole('button', { name: /^Edit suggested note:/ }))
      const field = screen.getByLabelText('Suggested note')
      expect(field).toHaveFocus()
      expect(field).toHaveValue('Meanders speed up erosion.')
      await fireEvent.update(field, 'Meanders feed their own erosion.')
      await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(await screen.findByText('Meanders feed their own erosion.')).not.toHaveClass('bg-mark')
      expect(sent).toEqual([{ text: 'Meanders feed their own erosion.' }])
      expect(screen.queryByLabelText('Suggested note')).toBeNull()
      expect(screen.getByRole('button', { name: /^Edit suggested note:/ })).toHaveFocus()
    })

    it('can be edited and then left alone: Cancel or Escape send nothing', async () => {
      mockConversation([kickoff(), aiMessage('Try this.', { proposals: [note({ id: 'n1' })] })])
      const sent: unknown[] = []
      server.use(
        http.patch(`${conversationUrl}/proposals/n1`, async ({ request }) => {
          sent.push(await request.json())
          return HttpResponse.json(note({ id: 'n1' }))
        }),
      )
      await renderAt(page)
      await fireEvent.click(await screen.findByRole('button', { name: /^Edit suggested note:/ }))
      await fireEvent.update(screen.getByLabelText('Suggested note'), 'Something else')
      await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.getByText('Meanders speed up erosion.')).toBeInTheDocument()
      await fireEvent.click(screen.getByRole('button', { name: /^Edit suggested note:/ }))
      await fireEvent.keyDown(screen.getByLabelText('Suggested note'), { key: 'Escape' })
      expect(screen.queryByLabelText('Suggested note')).toBeNull()
      expect(sent).toEqual([])
    })

    it('keep the field open and say why when an edit could not be saved', async () => {
      mockConversation([kickoff(), aiMessage('Try this.', { proposals: [note({ id: 'n1' })] })])
      server.use(
        http.patch(`${conversationUrl}/proposals/n1`, () =>
          HttpResponse.json(
            { error: 'This suggestion was just decided by someone else.' },
            { status: 409 },
          ),
        ),
      )
      await renderAt(page)
      await fireEvent.click(await screen.findByRole('button', { name: /^Edit suggested note:/ }))
      await fireEvent.update(screen.getByLabelText('Suggested note'), 'Changed')
      await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('just decided by someone else')
      expect(screen.getByLabelText('Suggested note')).toBeInTheDocument()
    })

    it('are ignored with the cross, and can be brought back', async () => {
      const api = mockConversation([
        kickoff(),
        aiMessage('Try this.', { proposals: [note({ id: 'n1' })] }),
      ])
      server.use(
        http.post(`${conversationUrl}/proposals/n1/dismiss`, () => {
          api.messages[1]!.proposals = [note({ id: 'n1', status: 'dismissed' })]
          return HttpResponse.json(api.messages[1]!.proposals[0])
        }),
        http.post(`${conversationUrl}/proposals/n1/reconsider`, () => {
          api.messages[1]!.proposals = [note({ id: 'n1' })]
          return HttpResponse.json(api.messages[1]!.proposals[0])
        }),
      )
      await renderAt(page)
      await fireEvent.click(await screen.findByRole('button', { name: /^Ignore:/ }))
      expect(await screen.findByText(/· ignored/)).toBeInTheDocument()
      await fireEvent.click(screen.getByRole('button', { name: /^Stop ignoring:/ }))
      expect(await screen.findByRole('button', { name: /^Add to notes:/ })).toBeInTheDocument()
    })

    it('say why one could not be added, and stay to be ignored', async () => {
      mockConversation([kickoff(), aiMessage('Try this.', { proposals: [note({ id: 'n1' })] })])
      server.use(
        http.post(`${conversationUrl}/proposals/n1/accept`, () =>
          HttpResponse.json(
            { error: 'That point is already in your notes. Ignore this suggestion.' },
            { status: 409 },
          ),
        ),
      )
      await renderAt(page)
      await fireEvent.click(await screen.findByRole('button', { name: /^Add to notes:/ }))
      expect(await screen.findByRole('alert')).toHaveTextContent('already in your notes')
      expect(screen.getByRole('button', { name: /^Ignore:/ })).toBeEnabled()
    })
  })

  it('deletes the conversation only after asking, and then shows the invitation to start', async () => {
    const api = mockConversation([kickoff(), aiMessage('Go on.')])
    let wiped = false
    server.use(
      http.delete(conversationUrl, () => {
        wiped = true
        api.messages = []
        api.exists = false
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await renderAt(page)
    await screen.findByText('Go on.')
    await fireEvent.click(screen.getByRole('button', { name: 'Delete conversation' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete the conversation?' })
    expect(dialog).toHaveTextContent('for everyone in this publication')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(wiped).toBe(false)

    await fireEvent.click(screen.getByRole('button', { name: 'Delete conversation' }))
    await fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete conversation' }),
    )
    expect(await screen.findByRole('button', { name: 'Refine with your AI' })).toBeInTheDocument()
    expect(wiped).toBe(true)
  })

  it('says so when the idea or the conversation cannot be loaded', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([])),
      http.get('*/api/publications/ada-substack/ideas/i1', () =>
        HttpResponse.json({ error: 'Not found' }, { status: 404 }),
      ),
    )
    await renderAt(page)
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't open that idea")
  })

  it('says what to do when the conversation will not load', async () => {
    mockConversation(
      [kickoff(), aiMessage('Hello.')],
      [http.get(conversationUrl, () => HttpResponse.json({ error: 'x' }, { status: 500 }))],
    )
    await renderAt(page)
    expect(await screen.findByText(/couldn't load the conversation/)).toBeInTheDocument()
  })
})

const reading = (
  overrides: Partial<Proposal> = {},
  details: Partial<NonNullable<Proposal['reading']>> = {},
): Proposal =>
  proposal({
    tool: 'suggest_reading',
    input: {
      url: 'https://example.org/river-physics',
      title: 'The physics of rivers',
      why: 'It explains how bends grow.',
    },
    reading: {
      check: 'found',
      fetchedTitle: 'River Physics: a primer',
      fetchedAuthors: [],
      ...details,
    },
    ...overrides,
  })
const readingList = () => screen.findByRole('region', { name: 'Suggested reading' })

describe('suggested reading', () => {
  it('is laid out as the Research page lists its findings: title as a link, website, authors, reason', async () => {
    mockConversation([
      kickoff(),
      aiMessage('Try this.', {
        proposals: [reading({}, { fetchedAuthors: ['A. Writer', 'B. Author'] })],
      }),
    ])
    await renderAt(page)
    const list = within(await readingList())
    const title = list.getByRole('link', { name: /^River Physics: a primer/ })
    expect(title).toHaveAttribute('href', 'https://example.org/river-physics')
    expect(title).toHaveAttribute('target', '_blank')
    expect(title).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(list.getByText(/example\.org · A\. Writer, B\. Author/)).toBeInTheDocument()
    expect(list.getByText('It explains how bends grow.')).toHaveClass('bg-mark')
    expect(list.queryByText('The physics of rivers')).toBeNull() // what the AI called it is not shown
    expect(list.getByRole('button', { name: /^Add to reading list: River Physics/ })).toBeEnabled()
    expect(list.getByRole('button', { name: /^Ignore: River Physics/ })).toBeEnabled()
  })

  it('adds the page when ticked, and then says it is in the reading list, with no way to take it back here', async () => {
    const card = reading({ id: 'r1' })
    let accepted: unknown
    const api = mockConversation([kickoff(), aiMessage('Try this.', { proposals: [card] })])
    server.use(
      http.post(`${conversationUrl}/proposals/r1/accept`, async ({ request }) => {
        accepted = await request.json()
        api.messages[1]!.proposals = [{ ...card, status: 'accepted', decidedByName: 'Ada' }]
        return HttpResponse.json(api.messages[1]!.proposals[0])
      }),
    )
    await renderAt(page)
    await fireEvent.click(await screen.findByRole('button', { name: /^Add to reading list:/ }))
    expect(await screen.findByText(/in the reading list/)).toBeInTheDocument()
    expect(accepted).toEqual({})
    expect(screen.queryByRole('button', { name: /^Take off the reading list/ })).toBeNull()
  })

  it('can be ignored, and brought back', async () => {
    const card = reading({ id: 'r1' })
    const api = mockConversation([kickoff(), aiMessage('Try this.', { proposals: [card] })])
    server.use(
      http.post(`${conversationUrl}/proposals/r1/dismiss`, () => {
        api.messages[1]!.proposals = [{ ...card, status: 'dismissed' }]
        return HttpResponse.json(api.messages[1]!.proposals[0])
      }),
      http.post(`${conversationUrl}/proposals/r1/reconsider`, () => {
        api.messages[1]!.proposals = [card]
        return HttpResponse.json(card)
      }),
    )
    await renderAt(page)
    await fireEvent.click(await screen.findByRole('button', { name: /^Ignore:/ }))
    expect(await screen.findByText(/ignored/)).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: /^Stop ignoring:/ }))
    expect(await screen.findByRole('button', { name: /^Add to reading list:/ })).toBeInTheDocument()
  })

  it('says a page with no readable title is unconfirmed', async () => {
    mockConversation([
      kickoff(),
      aiMessage('Try this.', {
        proposals: [reading({}, { check: 'no-title', fetchedTitle: null })],
      }),
    ])
    await renderAt(page)
    const list = within(await readingList())
    expect(list.getByText('We couldn’t confirm the title of this page.')).toBeInTheDocument()
    expect(list.getByRole('button', { name: /^Add to reading list:/ })).toBeEnabled() // allowed, with the warning
  })

  it.each([
    ['not-found', 'We couldn’t find a website at this address, so it can’t be added.'],
    ['not-public', 'This address isn’t a public website, so it can’t be added.'],
  ] as const)('flags a %s address and allows only ignoring it', async (check, message) => {
    mockConversation([
      kickoff(),
      aiMessage('Try this.', { proposals: [reading({}, { check, fetchedTitle: null })] }),
    ])
    await renderAt(page)
    const list = within(await readingList())
    expect(list.getByText(message)).toBeInTheDocument()
    expect(list.getByRole('button', { name: /^Add to reading list:/ })).toBeDisabled()
    expect(list.getByRole('button', { name: /^Ignore:/ })).toBeEnabled()
  })

  it('shows why adding was refused, and leaves the suggestion to decide on', async () => {
    const card = reading({ id: 'r1' })
    mockConversation([kickoff(), aiMessage('Try this.', { proposals: [card] })])
    server.use(
      http.post(`${conversationUrl}/proposals/r1/accept`, () =>
        HttpResponse.json(
          { error: 'That link is already in this idea. Dismiss this suggestion.' },
          { status: 409 },
        ),
      ),
    )
    await renderAt(page)
    await fireEvent.click(await screen.findByRole('button', { name: /^Add to reading list:/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already in this idea')
    expect(screen.getByRole('button', { name: /^Add to reading list:/ })).toBeEnabled()
  })
})

describe('several conversations', () => {
  const two = [
    summary('c1', 'Ada', '2026-01-05T10:00:00Z'),
    summary('c2', 'Bob', '2026-02-07T09:00:00Z'),
  ]
  const detail = (id: string, messages: ConversationMessage[]) =>
    http.get(`${conversationsUrl}/${id}`, () =>
      HttpResponse.json({
        ...two.find((c) => c.id === id)!,
        messages,
        replyingNow: null,
      }),
    )
  const withTwo = () =>
    mockConversation(
      [kickoff(), aiMessage('Older question?')],
      [
        http.get(conversationsUrl, () => HttpResponse.json({ conversations: two })),
        detail('c2', [kickoff(), aiMessage('Newer question?')]),
      ],
    )

  it('shows the newest first, who began it, and pages back to the earlier one', async () => {
    withTwo()
    await renderAt(page)
    expect(await screen.findByText('Newer question?')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /2026 · Bob$/ })).toBeInTheDocument()
    expect(screen.queryByText('Older question?')).toBeNull()

    const nav = screen.getAllByRole('navigation', { name: /^Conversations, / })[0]!
    expect(within(nav).getByText('Conversation 2 of 2')).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Later conversation' })).toBeDisabled()
    await fireEvent.click(within(nav).getByRole('button', { name: 'Earlier conversation' }))
    expect(await screen.findByText('Older question?')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /2026 · Ada$/ })).toBeInTheDocument()
    expect(screen.queryByText('Newer question?')).toBeNull()
  })

  it('shows no paging for a single conversation', async () => {
    mockConversation([kickoff(), aiMessage('Only one.')])
    await renderAt(page)
    await screen.findByText('Only one.')
    expect(screen.queryByRole('navigation', { name: /^Conversations, / })).toBeNull()
  })

  it('starts another beside the others, sends its opening there, and shows it', async () => {
    const api = withTwo()
    const made: string[] = []
    const posted: Record<string, unknown[]> = {}
    let conversations = [...two]
    server.use(
      http.get(conversationsUrl, () => HttpResponse.json({ conversations })),
      http.post(conversationsUrl, () => {
        made.push('c3')
        conversations = [...two, summary('c3', 'Ada', '2026-03-01T09:00:00Z')]
        return HttpResponse.json(conversations[2], { status: 201 })
      }),
      http.get(`${conversationsUrl}/c3`, () =>
        HttpResponse.json({
          ...conversations[2],
          messages: [kickoff(), aiMessage('Fresh start.')],
          replyingNow: null,
        }),
      ),
      http.post(`${conversationsUrl}/c3/messages`, async ({ request }) => {
        posted.c3 = [...(posted.c3 ?? []), await request.json()]
        return sse([{ type: 'done', message: aiMessage('Fresh start.') }])
      }),
    )
    await renderAt(page)
    await screen.findByText('Newer question?')
    // What leaves the system is said beside the button, which sits above the thread.
    expect(
      screen.getByText(/This will send this publication’s description and this idea’s title/),
    ).toBeVisible()
    const above = screen.getByRole('button', { name: 'New conversation' })
    expect(
      above.compareDocumentPosition(screen.getByRole('log', { name: 'Conversation' })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: 'New conversation' }))
    expect(await screen.findByText('Fresh start.')).toBeInTheDocument()
    expect(made).toEqual(['c3'])
    expect(posted.c3).toEqual([{ start: true }])
    expect(api.posts).toEqual([]) // nothing went into the others
  })

  it('stops at five, and says what to do', async () => {
    const five = Array.from({ length: 5 }, (_, i) => summary(`c${i + 1}`))
    mockConversation(
      [kickoff(), aiMessage('Hello.')],
      [
        http.get(conversationsUrl, () => HttpResponse.json({ conversations: five })),
        http.get(`${conversationsUrl}/c5`, () =>
          HttpResponse.json({
            ...five[4],
            messages: [kickoff(), aiMessage('Fifth.')],
            replyingNow: null,
          }),
        ),
      ],
    )
    await renderAt(page)
    await screen.findByText('Fifth.')
    expect(screen.getByRole('button', { name: 'New conversation' })).toBeDisabled()
    expect(screen.getByText(/the most it can hold\. Delete one to start another/)).toBeVisible()
  })

  it('deletes only the one on screen, then shows the one before it', async () => {
    withTwo()
    const deleted: string[] = []
    let conversations = [...two]
    server.use(
      http.get(conversationsUrl, () => HttpResponse.json({ conversations })),
      http.delete(`${conversationsUrl}/c2`, () => {
        deleted.push('c2')
        conversations = [two[0]!]
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await renderAt(page)
    await screen.findByText('Newer question?')
    await fireEvent.click(screen.getByRole('button', { name: 'Delete conversation' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete the conversation?' })
    expect(dialog).toHaveTextContent('Changes you have already accepted stay.')
    expect(dialog).not.toHaveTextContent('other conversations')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete conversation' }))
    expect(await screen.findByText('Older question?')).toBeInTheDocument()
    expect(deleted).toEqual(['c2'])
    expect(screen.queryByText('Newer question?')).toBeNull()
  })

  it('says why a new one could not be made', async () => {
    mockConversation([kickoff(), aiMessage('Hello.')])
    server.use(
      http.post(conversationsUrl, () =>
        HttpResponse.json(
          {
            error:
              'This idea has 5 conversations, the most it can hold. Delete one to start another.',
          },
          { status: 409 },
        ),
      ),
    )
    await renderAt(page)
    await screen.findByText('Hello.')
    await fireEvent.click(screen.getByRole('button', { name: 'New conversation' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Delete one to start another')
  })
})

describe('the refine page: tutorial mode', () => {
  const text =
    /^Your AI asks questions about this idea and suggests the points you make as notes\.$/
  const setup = async (on: boolean) => {
    mockConversation()
    server.use(signedInAs(on ? { ...testUser, tutorialMode: true } : testUser))
    // The route 'brainstorm' is this kind of page (see tutorial-routes.test.ts).
    await renderAt(page)
    await screen.findByRole('button', { name: 'Refine with your AI' })
  }

  it('writes out what the page is for', async () => {
    await setup(true)
    expect(screen.getByText(text)).toBeVisible()
  })

  it('says none of it when it is off', async () => {
    await setup(false)
    expect(screen.queryByText(text)).toBeNull()
  })
})

describe('a reply with no words', () => {
  const none = 'Your AI didn’t write a reply. Send a message to carry on.'

  it('says so in the reply’s box instead of leaving it empty, with its suggestions still shown', async () => {
    mockConversation([
      kickoff(),
      aiMessage('', {
        proposals: [proposal({ tool: 'suggest_note', input: { text: 'A point.' } })],
      }),
    ])
    await renderAt(page)
    expect(await screen.findByText(none)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Suggested notes' })).toBeInTheDocument()
  })

  it('says nothing of the kind when there are words, or when it was stopped, declined or cut short', async () => {
    mockConversation([
      kickoff(),
      aiMessage('Here are my words.'),
      userMessage('Go on'),
      aiMessage('', { stopReason: 'refusal' }),
      userMessage('And?'),
      aiMessage('', { status: 'stopped', stopReason: null }),
      userMessage('Again'),
      aiMessage('', { stopReason: 'max_tokens' }),
    ])
    await renderAt(page)
    await screen.findByText('Here are my words.')
    expect(screen.queryByText(none)).toBeNull()
  })
})

describe('a conversation’s title', () => {
  const titled = (title: string | null, titleByAi: boolean) =>
    mockConversation(
      [kickoff(), aiMessage('Hello.')],
      [
        http.get(conversationsUrl, () =>
          HttpResponse.json({ conversations: [summary('c1', 'Ada', undefined, title, titleByAi)] }),
        ),
        http.get(conversationUrl, () =>
          HttpResponse.json({
            ...summary('c1', 'Ada', undefined, title, titleByAi),
            messages: [kickoff(), aiMessage('Hello.')],
            replyingNow: null,
          }),
        ),
      ],
    )

  it('puts the AI’s title above the date and who began it, in the highlighter', async () => {
    titled('Why bends keep growing', true)
    await renderAt(page)
    const heading = await screen.findByRole('heading', { name: 'Why bends keep growing' })
    expect(within(heading).getByText('Why bends keep growing')).toHaveClass('bg-mark')
    expect(screen.getByText(/2026 · Ada$/)).toBeInTheDocument()
  })

  it('shows a title a person gave plainly, and the date alone when there is none', async () => {
    titled('My own name', false)
    await renderAt(page)
    expect(await screen.findByText('My own name')).not.toHaveClass('bg-mark')
  })

  it('has the date and name stand in as the title when there is none', async () => {
    titled(null, false)
    await renderAt(page)
    const heading = await screen.findByRole('heading', { name: /2026 · Ada$/ })
    expect(heading).toBeInTheDocument()
    expect(screen.getAllByText(/2026 · Ada/)).toHaveLength(1) // not said twice
  })

  it('renames with the edit icon: focus goes into the field, Save sends it, and the highlighter goes', async () => {
    titled('The AI’s title', true)
    const sent: unknown[] = []
    let renamed = false
    server.use(
      http.patch(conversationUrl, async ({ request }) => {
        sent.push(await request.json())
        renamed = true
        return HttpResponse.json(summary('c1', 'Ada', undefined, 'My own name', false))
      }),
      http.get(conversationsUrl, () =>
        HttpResponse.json({
          conversations: [
            renamed
              ? summary('c1', 'Ada', undefined, 'My own name', false)
              : summary('c1', 'Ada', undefined, 'The AI’s title', true),
          ],
        }),
      ),
      http.get(conversationUrl, () =>
        HttpResponse.json({
          ...(renamed
            ? summary('c1', 'Ada', undefined, 'My own name', false)
            : summary('c1', 'Ada', undefined, 'The AI’s title', true)),
          messages: [kickoff(), aiMessage('Hello.')],
          replyingNow: null,
        }),
      ),
    )
    await renderAt(page)
    await fireEvent.click(await screen.findByRole('button', { name: 'Rename conversation' }))
    const field = screen.getByLabelText('Conversation title')
    expect(field).toHaveFocus()
    expect(field).toHaveValue('The AI’s title')
    await fireEvent.update(field, '  My own name ')
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('My own name')).not.toHaveClass('bg-mark')
    expect(sent).toEqual([{ title: 'My own name' }])
    expect(screen.queryByLabelText('Conversation title')).toBeNull()
    expect(screen.getByRole('button', { name: 'Rename conversation' })).toHaveFocus()
  })

  it('cancels a rename with Cancel or Escape, sending nothing', async () => {
    titled('The AI’s title', true)
    const sent: unknown[] = []
    server.use(
      http.patch(conversationUrl, async ({ request }) => {
        sent.push(await request.json())
        return HttpResponse.json(summary('c1'))
      }),
    )
    await renderAt(page)
    await fireEvent.click(await screen.findByRole('button', { name: 'Rename conversation' }))
    await fireEvent.update(screen.getByLabelText('Conversation title'), 'Something else')
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('The AI’s title')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Rename conversation' }))
    await fireEvent.keyDown(screen.getByLabelText('Conversation title'), { key: 'Escape' })
    expect(screen.queryByLabelText('Conversation title')).toBeNull()
    expect(sent).toEqual([])
  })

  it('says why a rename did not go through, and keeps the field open', async () => {
    titled('The AI’s title', true)
    server.use(
      http.patch(conversationUrl, () =>
        HttpResponse.json({ error: 'Use up to 60 characters' }, { status: 400 }),
      ),
    )
    await renderAt(page)
    await fireEvent.click(await screen.findByRole('button', { name: 'Rename conversation' }))
    await fireEvent.update(screen.getByLabelText('Conversation title'), 'Another')
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Use up to 60 characters')
    expect(screen.getByLabelText('Conversation title')).toBeInTheDocument()
  })

  it('deletes from the icon beside the title, after asking', async () => {
    titled('The AI’s title', true)
    await renderAt(page)
    const row = (await screen.findByRole('heading', { name: 'The AI’s title' })).parentElement!
    await fireEvent.click(within(row).getByRole('button', { name: 'Delete conversation' }))
    expect(screen.getByRole('dialog', { name: 'Delete the conversation?' })).toBeInTheDocument()
  })
})
