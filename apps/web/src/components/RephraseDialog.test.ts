import { VueQueryPlugin } from '@tanstack/vue-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { REPHRASE } from '@wordwright/core'
import { llmSettings, server, useMockServer } from '../test-utils'
import RephraseDialog from './RephraseDialog.vue'

useMockServer()

const WORDING = 'The river bends because the outside bank erodes faster than the inside.'
const options = (n: number, stem = 'Option') =>
  Array.from({ length: n }, (_, i) => `${stem} ${i + 1} puts it another way.`)

/** What the server was asked, and what it answers. */
function mockRephrase(
  answer: (n: number) => Response | object = (n) => ({
    size: 'short',
    options: options(6, `Round ${n} option`),
  }),
) {
  const asked: Record<string, unknown>[] = []
  server.use(
    llmSettings(true),
    http.post('*/api/publications/p1/assist/rephrase', async ({ request }) => {
      asked.push((await request.json()) as Record<string, unknown>)
      const res = answer(asked.length)
      return res instanceof Response ? res : HttpResponse.json(res)
    }),
  )
  return asked
}

function show(props: Record<string, unknown> = {}) {
  const view = render(RephraseDialog, {
    props: {
      open: true,
      kind: 'passage',
      wording: WORDING,
      publicationId: 'p1',
      draftId: 'd1',
      ...props,
    },
    global: {
      plugins: [
        createPinia(),
        [VueQueryPlugin, { queryClientConfig: { defaultOptions: { queries: { retry: false } } } }],
        createRouter({
          history: createMemoryHistory(),
          routes: [{ path: '/account/ai', name: 'account-ai', component: { template: '<p />' } }],
        }),
      ],
    },
  })
  return view
}

const aimField = () => screen.getByLabelText('What should it do?')
const generate = () => screen.getByRole('button', { name: 'Generate options' })
const useThis = () => screen.getByRole('button', { name: 'Use this' })
const lastEmit = (view: ReturnType<typeof show>, name: string) =>
  (view.emitted()[name] as unknown[][] | undefined)?.at(-1)?.[0]

/** Types an aim and asks. */
async function ask(aim: string) {
  await fireEvent.update(aimField(), aim)
  await fireEvent.click(generate())
}

afterEach(() => vi.restoreAllMocks())

describe('RephraseDialog', () => {
  it('is a labelled dialog showing the wording to work on, with the aim to be filled in first', async () => {
    show()
    const dialog = await screen.findByRole('dialog', { name: 'Rephrase this passage' })
    expect(within(dialog).getByLabelText('Current wording')).toHaveValue(WORDING)
    expect(aimField()).toHaveValue('')
    await waitFor(() => expect(aimField()).toHaveFocus())
    expect(dialog).toHaveTextContent(
      'This will send this publication’s description, your draft, these words and your aim to your AI. It will not send your notes.',
    )
    expect(screen.getByText('3 rounds of options here')).toBeInTheDocument()
  })

  it('says what is needed before options can be asked for, and asks for nothing until then', async () => {
    const asked = mockRephrase()
    show()
    expect(generate()).toBeDisabled()
    expect(generate()).toHaveAccessibleDescription(/Say in a few words what you want this to do/)
    await fireEvent.update(aimField(), 'Plainer')
    expect(generate()).toBeDisabled()
    await fireEvent.update(aimField(), 'Plainer for someone new')
    expect(generate()).toBeEnabled()
    expect(asked).toHaveLength(0)
  })

  it('refuses wording that cannot be rephrased, and says what to do', async () => {
    mockRephrase()
    show()
    await fireEvent.update(screen.getByLabelText('Current wording'), 'Too few words')
    expect(screen.getByText(/Select at least 5 words/)).toBeInTheDocument()
    await fireEvent.update(aimField(), 'Plainer for someone new')
    expect(generate()).toBeDisabled()
  })

  it('saves the draft first, then sends the wording, the aim and no earlier rounds', async () => {
    const asked = mockRephrase()
    const order: string[] = []
    const prepare = vi.fn(async () => void order.push('saved'))
    show({ prepare })
    await ask('Plainer for someone new')
    await screen.findByRole('list', { name: 'Options' })
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(asked).toEqual([
      {
        draftId: 'd1',
        kind: 'passage',
        wording: WORDING,
        aim: 'Plainer for someone new',
        earlier: [],
      },
    ])
  })

  it('shows short options as a list, each with a button that puts it in the wording field', async () => {
    mockRephrase()
    show()
    await ask('Plainer for someone new')
    const list = await screen.findByRole('list', { name: 'Options' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(6)
    expect(items[1]).toHaveTextContent('Round 1 option 2 puts it another way.')
    expect(screen.getByText('Round 1 of 3')).toBeInTheDocument()

    await fireEvent.click(
      within(items[1]!).getByRole('button', { name: /Replace the wording with option 2/ }),
    )
    expect(screen.getByLabelText('Current wording')).toHaveValue(
      'Round 1 option 2 puts it another way.',
    )
  })

  it('hands back the option as edited, saying which option it began as and the aim it was offered for', async () => {
    mockRephrase()
    const view = show()
    await ask('Plainer for someone new')
    const list = await screen.findByRole('list', { name: 'Options' })
    await fireEvent.click(within(list).getAllByRole('button', { name: /Replace the wording/ })[0]!)
    await fireEvent.update(
      screen.getByLabelText('Current wording'),
      'My own version of option one.',
    )
    await fireEvent.click(useThis())
    expect(lastEmit(view, 'use')).toEqual({
      text: 'My own version of option one.',
      offered: 'Round 1 option 1 puts it another way.',
      aim: 'Plainer for someone new',
    })
  })

  it('hands back an option unchanged too: nothing forces an edit', async () => {
    mockRephrase()
    const view = show()
    await ask('Plainer for someone new')
    const list = await screen.findByRole('list', { name: 'Options' })
    await fireEvent.click(within(list).getAllByRole('button', { name: /Replace the wording/ })[2]!)
    await fireEvent.click(useThis())
    expect(lastEmit(view, 'use')).toMatchObject({ text: 'Round 1 option 3 puts it another way.' })
  })

  it('hands back the writer’s own words with no option recorded', async () => {
    const view = show()
    expect(useThis()).toBeDisabled() // nothing has changed yet
    await fireEvent.update(
      screen.getByLabelText('Current wording'),
      'The river wanders because banks erode.',
    )
    await fireEvent.click(useThis())
    expect(lastEmit(view, 'use')).toEqual({
      text: 'The river wanders because banks erode.',
      offered: null,
      aim: null,
    })
  })

  it('needs a changed aim for another round, and sends the earlier rounds back with it', async () => {
    const asked = mockRephrase()
    show()
    await ask('Plainer for someone new')
    await screen.findByRole('list', { name: 'Options' })

    expect(generate()).toBeDisabled()
    expect(generate()).toHaveAccessibleDescription(/Change your aim to ask again/)
    await fireEvent.update(aimField(), '  PLAINER for someone   new ')
    expect(generate()).toBeDisabled() // spacing and capitals are not a change

    await ask('Shorter and sharper')
    await screen.findByText('Round 2 of 3')
    expect(asked[1]).toMatchObject({
      aim: 'Shorter and sharper',
      earlier: [{ aim: 'Plainer for someone new', options: options(6, 'Round 1 option') }],
    })
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Round 2 option 1')
  })

  it('stops after the rounds it allows, and says what to do next', async () => {
    mockRephrase()
    show({ rounds: 2 })
    await ask('Plainer for someone new')
    await screen.findByText('Round 1 of 2')
    await ask('Shorter and sharper')
    await screen.findByText('Round 2 of 2')
    await fireEvent.update(aimField(), 'Warmer, like a letter to a friend')
    expect(generate()).toBeDisabled()
    expect(generate()).toHaveAccessibleDescription(
      /had your 2 rounds.*Choose one, or write it yourself/,
    )
  })

  it('shows long options one at a time in a carousel, with Previous and Next, a count and arrow keys', async () => {
    mockRephrase(() => ({ size: 'long', options: options(4, 'Paragraph') }))
    show()
    await ask('Plainer for someone new')
    const carousel = await screen.findByRole('group', { name: 'Options' })
    expect(carousel).toHaveAttribute('aria-roledescription', 'carousel')
    expect(screen.queryByRole('list', { name: 'Options' })).toBeNull()
    expect(within(carousel).getByText('Paragraph 1 puts it another way.')).toBeInTheDocument()
    expect(within(carousel).getByText('Option 1 of 4')).toBeInTheDocument()
    expect(within(carousel).getByRole('button', { name: 'Previous' })).toBeDisabled()

    await fireEvent.click(within(carousel).getByRole('button', { name: 'Next' }))
    expect(within(carousel).getByText('Paragraph 2 puts it another way.')).toBeInTheDocument()
    expect(within(carousel).queryByText('Paragraph 1 puts it another way.')).toBeNull()
    await fireEvent.keyDown(carousel, { key: 'ArrowRight' })
    expect(within(carousel).getByText('Option 3 of 4')).toBeInTheDocument()
    await fireEvent.keyDown(carousel, { key: 'ArrowLeft' })
    expect(within(carousel).getByText('Option 2 of 4')).toBeInTheDocument()

    await fireEvent.click(
      within(carousel).getByRole('button', { name: /Replace the wording with option 2/ }),
    )
    expect(screen.getByLabelText('Current wording')).toHaveValue('Paragraph 2 puts it another way.')
  })

  it('shows what went wrong in plain words, and lets the writer try again', async () => {
    mockRephrase((n) =>
      n === 1
        ? HttpResponse.json(
            { error: 'Add your Anthropic API key in your account settings to use this feature' },
            { status: 409 },
          )
        : { size: 'short', options: options(5) },
    )
    show()
    await ask('Plainer for someone new')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Add your Anthropic API key')
    expect(within(alert).getByRole('link', { name: 'Add your AI key' })).toHaveAttribute(
      'href',
      '/account/ai',
    )
    expect(screen.queryByRole('list', { name: 'Options' })).toBeNull()
    expect(generate()).toBeEnabled() // nothing was spent or counted
    await fireEvent.click(generate())
    await screen.findByRole('list', { name: 'Options' })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a working state while asking, and cannot be closed by Escape meanwhile', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      llmSettings(true),
      http.post('*/api/publications/p1/assist/rephrase', async () => {
        await held
        return HttpResponse.json({ size: 'short', options: options(5) })
      }),
    )
    const view = show()
    await ask('Plainer for someone new')
    await waitFor(() => expect(generate()).toBeDisabled())
    expect(generate()).toHaveAttribute('aria-busy', 'true')
    await fireEvent.keyDown(document, { key: 'Escape' })
    expect(view.emitted().cancel).toBeUndefined()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled() // so a late answer cannot land in a later window
    release()
    await screen.findByRole('list', { name: 'Options' })
  })

  it('closes with Cancel or Escape, and starts again from round 1 when opened again', async () => {
    mockRephrase()
    const view = show()
    await ask('Plainer for someone new')
    await screen.findByRole('list', { name: 'Options' })
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(view.emitted().cancel).toHaveLength(1)
    await fireEvent.keyDown(document, { key: 'Escape' })
    expect(view.emitted().cancel).toHaveLength(2)

    await view.rerender({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
    await view.rerender({ open: true })
    expect(aimField()).toHaveValue('')
    expect(screen.queryByRole('list', { name: 'Options' })).toBeNull()
    expect(screen.getByText('3 rounds of options here')).toBeInTheDocument()
  })

  it('works for a title: its own heading, and a single-line result', async () => {
    const asked = mockRephrase()
    const view = show({ kind: 'title', wording: 'Why rivers bend' })
    expect(await screen.findByRole('dialog', { name: 'Rephrase the title' })).toBeInTheDocument()
    await ask('A plain statement of the claim')
    await screen.findByRole('list', { name: 'Options' })
    expect(asked[0]).toMatchObject({ kind: 'title', wording: 'Why rivers bend' })
    await fireEvent.update(
      screen.getByLabelText('Current wording'),
      'Rivers bend\nbecause of   erosion',
    )
    await fireEvent.click(useThis())
    expect(lastEmit(view, 'use')).toMatchObject({ text: 'Rivers bend because of erosion' })
  })

  it('uses the limits in one place', () => {
    expect(REPHRASE.selection.minWords).toBe(5)
  })
})
