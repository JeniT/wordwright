import { fireEvent, render, screen } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import QueryState from './QueryState.vue'

const query = (state: { pending?: boolean; error?: unknown }) => ({
  isPending: ref(!!state.pending),
  isError: ref(state.error !== undefined),
  error: ref(state.error),
  refetch: vi.fn(),
})

const slots = { default: '<p>The content</p>' }

describe('QueryState', () => {
  it('says it is loading, and shows no content yet', () => {
    render(QueryState, { props: { query: query({ pending: true }), what: 'the notes' }, slots })
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('The content')).toBeNull()
  })

  it('can say what is loading', () => {
    render(QueryState, {
      props: {
        query: query({ pending: true }),
        what: 'your feeds',
        loading: 'Reading your feeds…',
      },
      slots,
    })
    expect(screen.getByText('Reading your feeds…')).toBeInTheDocument()
  })

  it('says what could not be loaded, and tries again on request', async () => {
    const q = query({ error: new Error('boom') })
    render(QueryState, { props: { query: q, what: 'the notes' }, slots })
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load the notes.")
    expect(screen.getByRole('alert')).toHaveTextContent('Check your connection and try again.')
    expect(screen.queryByText('The content')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(q.refetch).toHaveBeenCalledOnce()
  })

  it('adds the reason when asked, for errors a person can act on', () => {
    render(QueryState, {
      props: {
        query: query({ error: new Error('Too many requests. Wait a minute.') }),
        what: 'your feeds',
        detail: true,
      },
      slots,
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Too many requests. Wait a minute.')
  })

  it('shows the content once it has loaded', () => {
    render(QueryState, { props: { query: query({}), what: 'the notes' }, slots })
    expect(screen.getByText('The content')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
