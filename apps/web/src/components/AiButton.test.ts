import { VueQueryPlugin } from '@tanstack/vue-query'
import { render, screen } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { llmSettings, server, useMockServer } from '../test-utils'
import AiButton from './AiButton.vue'

useMockServer()

function show(props: Record<string, unknown> = {}, attrs: Record<string, unknown> = {}) {
  return render(AiButton, {
    props: { ...props, ...attrs },
    slots: { default: 'Critique' },
    global: {
      plugins: [
        VueQueryPlugin,
        createRouter({
          history: createMemoryHistory(),
          routes: [{ path: '/account/ai', name: 'account-ai', component: { template: '<p />' } }],
        }),
      ],
    },
  })
}
const button = () => screen.getByRole('button', { name: 'Critique' })

describe('AiButton', () => {
  it('idle: shows the AI icon beside its label, and says what the icon means', async () => {
    const { container } = show()
    expect(button()).toBeEnabled()
    expect(button()).toHaveAttribute('aria-busy', 'false')
    expect(button().querySelector('svg')).toBeInTheDocument()
    expect(container.querySelector('.animate-spin')).toBeNull()
    // The provider arrives from the saved settings; until then it is plain "AI".
    expect(
      await screen.findByText('Uses your Anthropic key, so it costs tokens'),
    ).toBeInTheDocument()
    expect(button()).toHaveAccessibleDescription('Uses your Anthropic key, so it costs tokens')
    expect(button()).toHaveAttribute('title', 'Uses your Anthropic key, so it costs tokens')
  })

  it('busy: a spinner replaces the icon, the button waits, and the wait is read out', () => {
    const { container } = show({ busy: true, busyText: 'Reading your draft…' })
    expect(button()).toBeDisabled()
    expect(button()).toHaveAttribute('aria-busy', 'true')
    expect(button()).toHaveTextContent('Critique') // the label never changes, so the width does not jump
    expect(container.querySelectorAll('svg')).toHaveLength(1) // the spinner takes the icon's place
    expect(container.querySelector('svg.motion-safe\\:animate-spin')).toBeInTheDocument()
    expect(container.querySelector('[aria-live=polite]')).toHaveTextContent('Reading your draft…')
  })

  it('says nothing while idle', () => {
    const { container } = show()
    expect(container.querySelector('[aria-live=polite]')).toBeEmpty()
  })

  it('disabled: stays an AI button, not busy', () => {
    show({ disabled: true })
    expect(button()).toBeDisabled()
    expect(button()).toHaveAttribute('aria-busy', 'false')
    expect(button().querySelector('svg')).toBeInTheDocument()
  })

  it('keeps a description the caller gave it, and is a plain button unless told otherwise', () => {
    show({}, { 'aria-describedby': 'looks' })
    expect(button().getAttribute('aria-describedby')?.split(' ')[0]).toBe('looks')
    expect(button()).toHaveAttribute('type', 'button')
  })

  it('with no key saved, is disabled with the reason, and points to where a key is added', async () => {
    server.use(llmSettings(false))
    show()
    const link = await screen.findByRole('link', { name: 'Add your AI key' })
    expect(link).toHaveAttribute('href', '/account/ai')
    expect(button()).toBeDisabled()
    expect(button()).toHaveAttribute('aria-busy', 'false')
    expect(button()).toHaveAccessibleDescription(
      'Add your AI key to use this Uses your Anthropic key, so it costs tokens',
    )
    expect(button()).toHaveAttribute('title', 'Add your AI key to use this')
  })

  it('once a key is saved, is enabled again', async () => {
    server.use(llmSettings(true))
    show()
    await screen.findByText('Uses your Anthropic key, so it costs tokens')
    expect(button()).toBeEnabled()
    expect(button()).toHaveAttribute('title', 'Uses your Anthropic key, so it costs tokens')
  })

  it('while the settings load, is not disabled and shows no link (no flash)', () => {
    show()
    expect(button()).toBeEnabled()
    expect(screen.queryByRole('link', { name: 'Add your AI key' })).toBeNull()
  })

  it('if the settings cannot be read, stays enabled: the server says what is wrong when it is pressed', async () => {
    server.use(http.get('*/api/llm', () => HttpResponse.json({ error: 'nope' }, { status: 500 })))
    show()
    await new Promise((r) => setTimeout(r, 50))
    expect(button()).toBeEnabled()
    expect(screen.queryByRole('link', { name: 'Add your AI key' })).toBeNull()
  })

  it('with a key, or before the settings load, shows no such link', async () => {
    server.use(llmSettings(true))
    show()
    await screen.findByText('Uses your Anthropic key, so it costs tokens')
    expect(screen.queryByRole('link', { name: 'Add your AI key' })).toBeNull()
  })
})
