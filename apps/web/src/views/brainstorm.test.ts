import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { BrainstormEvent, ConversationMessage, Proposal, RecordedNote } from '@lfwa/core'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const idea = {
  id: 'i1',
  profileId: 'ada-substack',
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
const conversationUrl = '*/api/profiles/ada-substack/ideas/i1/conversation'
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
    http.get('*/api/profiles', () => HttpResponse.json([])),
    http.get('*/api/profiles/ada-substack/ideas/i1', () => HttpResponse.json(idea)),
    http.get(conversationUrl, () =>
      HttpResponse.json({ messages: state.messages, replyingNow: state.replyingNow }),
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
    expect(await screen.findByRole('heading', { name: 'Brainstorm' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Back to the idea' })).toHaveAttribute(
      'href',
      '/p/ada-substack/ideas/i1',
    )
    expect(screen.getByText(/the text of your\s+drafts never is/)).toBeInTheDocument()
    expect(screen.getByText(/Everyone in this profile sees this conversation/)).toBeInTheDocument()

    const summary = screen.getByText('The idea being discussed').closest('details')!
    expect(within(summary).getByText(/Erosion loops/)).toBeInTheDocument()
    expect(within(summary).getByText('A paper')).toBeInTheDocument()

    expect(await screen.findByRole('button', { name: 'Start brainstorming' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Your message')).toBeNull() // nothing to answer yet
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
    await fireEvent.click(await screen.findByRole('button', { name: 'Start brainstorming' }))

    expect(await screen.findByText('Brainstorm started by Ada')).toBeInTheDocument()
    await screen.findByText(/What is the/)
    // The bold only appears once its closing ** has arrived (and the live text is swapped for the saved message).
    await waitFor(() => expect(document.querySelector('.markdown strong')).toHaveTextContent('one'))
    expect(api.posts).toEqual([{ start: true }])
    await waitFor(() => expect(screen.getByLabelText('Your message')).toBeEnabled())
    expect(screen.queryByRole('button', { name: 'Start brainstorming' })).toBeNull()
  })

  it('never shows the coach’s reply twice while the rest of the page catches up', async () => {
    // The thread is re-read, then the idea and its notes. While those are still on their way the
    // saved reply is already in the thread, and the streamed copy must not be shown beside it.
    let hold = false
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    mockConversation(
      [kickoff(), aiMessage('What is the claim?')],
      [
        http.get('*/api/profiles/ada-substack/ideas/i1', async () => {
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
    expect(await screen.findByText('Brainstorm started by Ada')).toBeInTheDocument()
    expect(api.posts).toEqual([{ start: true }])
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

  it('shows that the coach is thinking, then the words as they arrive, and can be stopped', async () => {
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
    release()
    expect(await screen.findByText(/Half a thought/)).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(screen.getByLabelText('Your message')).toBeEnabled())
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
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
        await screen.findByText("Your coach hasn't replied to the last message."),
      ).toBeInTheDocument()

      api.respond = () => {
        const reply = aiMessage('Here I am.')
        api.messages.push(reply)
        return sse([...words('Here I am.'), { type: 'done', message: reply }])
      }
      await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(await screen.findByText('Here I am.')).toBeInTheDocument()
      expect(api.posts.at(-1)).toEqual({ retry: true })
      expect(screen.queryByText("Your coach hasn't replied to the last message.")).toBeNull()
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

      expect(await screen.findByRole('alert')).toHaveTextContent('Add your Anthropic API key')
      expect(screen.getByRole('link', { name: 'Go to account settings' })).toHaveAttribute(
        'href',
        '/account',
      )
      expect(screen.getByLabelText('Your message')).toHaveValue('Please answer') // not lost
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
      expect(screen.queryByRole('link', { name: 'Go to account settings' })).toBeNull()
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
    expect(screen.queryByText("Your coach hasn't replied to the last message.")).toBeNull()
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
    expect(await screen.findByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Someone')).toBeInTheDocument() // an account that has gone
    expect(screen.getByText(/This reply was cut short/)).toBeInTheDocument()
    expect(screen.getByText('The reply was stopped here.')).toBeInTheDocument()
    expect(screen.getByText(/declined to answer that/)).toBeInTheDocument()
    expect(screen.getAllByText(/claude-sonnet-5-5/).length).toBeGreaterThan(0)
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
        http.get('*/api/profiles/ada-substack/ideas/i1', () => {
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

    it('show a new title against the current one, with accept and dismiss', async () => {
      withProposals(proposal({ input: { name: 'Why rivers loop' } }))
      await renderAt(page)
      const card = (
        await screen.findByRole('heading', { name: 'Suggested change to this idea' })
      ).closest('section')!
      expect(within(card).getByText('Why rivers meander')).toHaveClass('line-through') // what it replaces
      expect(within(card).getByText('Why rivers loop')).toBeInTheDocument()
      expect(within(card).getByRole('button', { name: 'Accept: a new title' })).toBeInTheDocument()
      expect(within(card).getByRole('button', { name: 'Dismiss: a new title' })).toBeInTheDocument()
    })

    it('are accepted with one press, and then show who accepted them', async () => {
      let accepted: unknown
      const api = withProposals(proposal({ id: 'p-upd' }))
      server.use(
        http.post(`${conversationUrl}/proposals/p-upd/accept`, async ({ request }) => {
          accepted = await request.json()
          api.messages[1]!.proposals = [
            proposal({ id: 'p-upd', status: 'accepted', decidedByName: 'Ada' }),
          ]
          return HttpResponse.json(api.messages[1]!.proposals[0])
        }),
      )
      await renderAt(page)
      await fireEvent.click(await screen.findByRole('button', { name: /^Accept:/ }))
      expect(await screen.findByText('Accepted by Ada.')).toBeInTheDocument()
      expect(accepted).toEqual({})
      expect(screen.queryByRole('button', { name: /^Accept:/ })).toBeNull()
    })

    it('are dismissed with one press', async () => {
      const api = withProposals(proposal({ id: 'p-no' }))
      server.use(
        http.post(`${conversationUrl}/proposals/p-no/dismiss`, () => {
          api.messages[1]!.proposals = [
            proposal({ id: 'p-no', status: 'dismissed', decidedByName: 'Ada' }),
          ]
          return HttpResponse.json(api.messages[1]!.proposals[0])
        }),
      )
      await renderAt(page)
      await fireEvent.click(await screen.findByRole('button', { name: /^Dismiss:/ }))
      expect(await screen.findByText('Dismissed by Ada.')).toBeInTheDocument()
    })

    it('warn when the title has changed, and say "apply anyway" instead of "accept"', async () => {
      let body: unknown
      const api = withProposals(
        proposal({ id: 'p-stale', stale: true, input: { name: 'Another title' } }),
      )
      server.use(
        http.post(`${conversationUrl}/proposals/p-stale/accept`, async ({ request }) => {
          body = await request.json()
          api.messages[1]!.proposals = [
            proposal({ id: 'p-stale', status: 'accepted', decidedByName: 'Ada' }),
          ]
          return HttpResponse.json(api.messages[1]!.proposals[0])
        }),
      )
      await renderAt(page)
      expect(
        await screen.findByText(/The title has changed since this was suggested/),
      ).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Accept:/ })).toBeNull()
      await fireEvent.click(screen.getByRole('button', { name: 'Apply anyway: a new title' }))
      expect(await screen.findByText('Accepted by Ada.')).toBeInTheDocument()
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
      await fireEvent.click(await screen.findByRole('button', { name: /^Accept:/ }))
      expect(await screen.findByRole('alert')).toHaveTextContent('already dismissed')
    })

    it('offer a new idea, and link to it once accepted', async () => {
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
      const cards = await screen.findAllByRole('heading', { name: 'Suggested new idea' })
      expect(cards).toHaveLength(2)
      expect(screen.getByText('Oxbow lakes')).toBeInTheDocument()
      expect(screen.getByText('Where meanders end.')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /^Accept: a new idea, “Oxbow lakes”/ }),
      ).toBeInTheDocument()
      expect(screen.getByText('No notes yet.')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Open the new idea' })).toHaveAttribute(
        'href',
        '/p/ada-substack/ideas/i2',
      )
      expect(screen.getByText('Accepted by Bob.')).toBeInTheDocument()
    })
  })

  it('starts again only after asking, and then shows the invitation to start', async () => {
    const api = mockConversation([kickoff(), aiMessage('Go on.')])
    let wiped = false
    server.use(
      http.delete(conversationUrl, () => {
        wiped = true
        api.messages = []
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await renderAt(page)
    await screen.findByText('Go on.')
    await fireEvent.click(screen.getByRole('button', { name: 'Start again' }))
    const dialog = screen.getByRole('dialog', { name: 'Start the conversation again?' })
    expect(dialog).toHaveTextContent('for everyone in this profile')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(wiped).toBe(false)

    await fireEvent.click(screen.getByRole('button', { name: 'Start again' }))
    await fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes, start again' }),
    )
    expect(await screen.findByRole('button', { name: 'Start brainstorming' })).toBeInTheDocument()
    expect(wiped).toBe(true)
  })

  it('says so when the idea or the conversation cannot be loaded', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/profiles', () => HttpResponse.json([])),
      http.get('*/api/profiles/ada-substack/ideas/i1', () =>
        HttpResponse.json({ error: 'Not found' }, { status: 404 }),
      ),
    )
    await renderAt(page)
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't open that idea")
  })

  it('says what to do when the conversation will not load', async () => {
    mockConversation(
      [],
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
const suggestionCard = () => screen.getByRole('region', { name: /^Suggested reading/ })

describe('suggested reading', () => {
  it('shows the address, the page’s own title beside the AI’s, and the AI’s reason as unchecked', async () => {
    mockConversation([kickoff(), aiMessage('Try this.', { proposals: [reading()] })])
    await renderAt(page)
    const card = within(await screen.findByRole('region', { name: /^Suggested reading/ }))
    expect(card.getByText(/passing on an address you gave it/)).toBeInTheDocument()
    expect(card.getByText('https://example.org/river-physics')).toBeInTheDocument()
    expect(card.getByText(/The page's own title:/)).toBeInTheDocument()
    expect(card.getAllByText('River Physics: a primer').length).toBeGreaterThan(0)
    expect(card.getByText('The physics of rivers')).toBeInTheDocument() // what the AI called it
    expect(card.getByText(/Why the AI suggests it \(unchecked\):/)).toBeInTheDocument()
    expect(card.getByText('It explains how bends grow.')).toBeInTheDocument()
    expect(card.getByText(/the page exists/)).toBeInTheDocument()
    const open = card.getByRole('link', { name: /Open the page/ })
    expect(open).toHaveAttribute('href', 'https://example.org/river-physics')
    expect(open).toHaveAttribute('target', '_blank')
    expect(open).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(card.getByRole('button', { name: /^Accept: .*River Physics: a primer/ })).toBeEnabled()
  })

  it('adds the page when accepted, and then says it was added', async () => {
    const card = reading()
    let accepted = false
    const api = mockConversation(
      [kickoff(), aiMessage('Try this.', { proposals: [card] })],
      [
        http.post(`${conversationUrl}/proposals/${card.id}/accept`, async ({ request }) => {
          expect(await request.json()).toEqual({})
          accepted = true
          api.messages = [
            kickoff(),
            aiMessage('Try this.', {
              proposals: [{ ...card, status: 'accepted', decidedByName: 'Ada' }],
            }),
          ]
          return HttpResponse.json({ ...card, status: 'accepted', decidedByName: 'Ada' })
        }),
      ],
    )
    await renderAt(page)
    await fireEvent.click(await screen.findByRole('button', { name: /^Accept: / }))
    await waitFor(() => expect(accepted).toBe(true))
    expect(await screen.findByText('Added to the reading list by Ada.')).toBeInTheDocument()
  })

  it('says a page with no readable title is unconfirmed, and what it would be listed as', async () => {
    mockConversation([
      kickoff(),
      aiMessage('Try this.', {
        proposals: [reading({}, { check: 'no-title', fetchedTitle: null })],
      }),
    ])
    await renderAt(page)
    const card = within(await screen.findByRole('region', { name: /^Suggested reading/ }))
    expect(card.getByText(/couldn't read a title from this page/)).toBeInTheDocument()
    expect(card.getByText(/listed as “The physics of rivers”, the AI's guess/)).toBeInTheDocument()
    expect(card.queryByText(/The page's own title:/)).toBeNull()
    expect(card.getByRole('button', { name: /^Accept: / })).toBeEnabled() // allowed, with the warning
  })

  it.each([
    ['not-found', /Problem: we couldn't find a website at this address/],
    ['not-public', /Problem: this address isn't a public website/],
  ] as const)('flags a %s address and allows only dismissing it', async (check, message) => {
    const card = reading({}, { check, fetchedTitle: null })
    let dismissed = false
    mockConversation(
      [kickoff(), aiMessage('Try this.', { proposals: [card] })],
      [
        http.post(`${conversationUrl}/proposals/${card.id}/dismiss`, () => {
          dismissed = true
          return HttpResponse.json({ ...card, status: 'dismissed' })
        }),
      ],
    )
    await renderAt(page)
    const region = within(await screen.findByRole('region', { name: /^Suggested reading/ }))
    expect(region.getByText(message)).toBeInTheDocument()
    expect(region.getByRole('button', { name: /^Accept: / })).toBeDisabled()
    await fireEvent.click(region.getByRole('button', { name: /^Dismiss: / }))
    await waitFor(() => expect(dismissed).toBe(true))
  })

  it('shows why an acceptance was refused, and leaves the suggestion to decide on', async () => {
    const card = reading()
    mockConversation(
      [kickoff(), aiMessage('Try this.', { proposals: [card] })],
      [
        http.post(`${conversationUrl}/proposals/${card.id}/accept`, () =>
          HttpResponse.json(
            { error: 'That link is already in this idea. Dismiss this suggestion.' },
            { status: 409 },
          ),
        ),
      ],
    )
    await renderAt(page)
    await fireEvent.click(await screen.findByRole('button', { name: /^Accept: / }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already in this idea')
    expect(suggestionCard()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Accept: / })).toBeEnabled()
  })
})
