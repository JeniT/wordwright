import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import SaveStatus from './SaveStatus.vue'

const mutation = (state: { pending?: boolean; success?: boolean; error?: unknown } = {}) => ({
  isPending: ref(!!state.pending),
  isSuccess: ref(!!state.success),
  isError: ref(state.error !== undefined),
  error: ref(state.error),
})

describe('SaveStatus', () => {
  it('says nothing while idle', () => {
    render(SaveStatus, { props: { mutation: mutation() } })
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says Saved once it worked, or the words it is given', () => {
    const { unmount } = render(SaveStatus, { props: { mutation: mutation({ success: true }) } })
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    unmount()
    render(SaveStatus, {
      props: { mutation: mutation({ success: true }), saved: 'Saved. This is the default.' },
    })
    expect(screen.getByRole('status')).toHaveTextContent('Saved. This is the default.')
  })

  it('takes a message with more in it as its slot', () => {
    render(SaveStatus, {
      props: { mutation: mutation({ success: true }) },
      slots: { default: 'Now called <strong>Ada</strong>.' },
    })
    expect(screen.getByRole('status')).toHaveTextContent('Now called Ada.')
  })

  it('says nothing while saving unless told what to say', () => {
    const { unmount } = render(SaveStatus, { props: { mutation: mutation({ pending: true }) } })
    expect(screen.queryByRole('status')).toBeNull()
    unmount()
    render(SaveStatus, { props: { mutation: mutation({ pending: true }), saving: 'Saving…' } })
    expect(screen.getByRole('status')).toHaveTextContent('Saving…')
  })

  it('announces why it failed, whichever of the mutations did', () => {
    render(SaveStatus, {
      props: {
        mutation: [mutation({ success: true }), mutation({ error: new Error('Too long.') })],
      },
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Too long.')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows a message of the form’s own, such as what a reset did', () => {
    render(SaveStatus, {
      props: {
        mutation: [mutation(), mutation({ success: true })],
        text: 'Back to the default prompt.',
      },
    })
    expect(screen.getByRole('status')).toHaveTextContent('Back to the default prompt.')
  })

  it('can show only errors', () => {
    render(SaveStatus, { props: { mutation: mutation({ success: true }), saved: '' } })
    expect(screen.queryByRole('status')).toBeNull()
  })
})
