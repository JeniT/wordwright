import { fireEvent, screen } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const draft = {
  id: 'd1',
  profileId: 'p1',
  ideaId: null,
  title: 'T',
  body: 'Some text',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

function mockEditor(critique: () => Response) {
  server.use(
    signedInAs(testUser),
    http.get('*/api/profiles', () => HttpResponse.json([])),
    http.get('*/api/profiles/p1/drafts/d1', () => HttpResponse.json(draft)),
    http.put('*/api/profiles/p1/drafts/d1', () => HttpResponse.json(draft)),
    http.post('*/api/profiles/p1/assist/critique', critique),
  )
}

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
    await screen.findByText(/Add your Anthropic API key/)
    await screen.findByRole('link', { name: 'Go to account settings' })
  })

  it('shows the critique when it works', async () => {
    mockEditor(() => HttpResponse.json({ text: 'Tighten the opening.' }))
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(await screen.findByRole('button', { name: 'Critique' }))
    await screen.findByText('Tighten the opening.')
  })
})
