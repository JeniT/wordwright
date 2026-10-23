import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
import CommentComposer from './CommentComposer.vue'

const show = (props: InstanceType<typeof CommentComposer>['$props']) =>
  render(CommentComposer, {
    props,
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
  })
const target = { block: 'b4', number: 4, quote: 'the outside bank' }

describe('CommentComposer', () => {
  it('is headed by the paragraph it is about, and has no General comment switch', () => {
    show({ target, add: vi.fn() })
    expect(screen.getByRole('heading', { name: 'Comment on paragraph 4' })).toBeInTheDocument()
    expect(screen.getByText('“the outside bank”')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('sends the paragraph and the selected words', async () => {
    const add = vi.fn().mockResolvedValue(undefined)
    show({ target, add })
    await fireEvent.update(screen.getByLabelText('Your comment'), 'Which bank?')
    await fireEvent.click(screen.getByRole('button', { name: 'Add comment' }))
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith({
        block: 'b4',
        text: 'Which bank?',
        quote: 'the outside bank',
      }),
    )
  })

  it('is general when there is no paragraph (the title, or nothing selected)', async () => {
    const add = vi.fn().mockResolvedValue(undefined)
    const { emitted } = show({ target: null, add })
    expect(screen.getByRole('heading', { name: 'General comment' })).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
    await fireEvent.update(screen.getByLabelText('Your comment'), 'Overall, lovely.')
    await fireEvent.click(screen.getByRole('button', { name: 'Add comment' }))
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith({ block: 'whole', text: 'Overall, lovely.' }),
    )
    await waitFor(() => expect(emitted().done).toHaveLength(1))
    expect(screen.queryByText(/Comment added|Saved/)).toBeNull() // the new card is the confirmation
  })

  it('says who will see it, waits for words, and keeps them when it fails', async () => {
    const add = vi.fn().mockRejectedValue(new Error('That paragraph is gone. Reload the page.'))
    const { emitted } = show({
      target,
      add,
      audience: 'Only you and Ada, the editor, will see this.',
    })
    expect(screen.getByText('Only you and Ada, the editor, will see this.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add comment' })).toBeDisabled()
    await fireEvent.update(screen.getByLabelText('Your comment'), 'Still here.')
    await fireEvent.click(screen.getByRole('button', { name: 'Add comment' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That paragraph is gone')
    expect(screen.getByLabelText('Your comment')).toHaveValue('Still here.')
    expect(emitted().done).toBeUndefined()
  })

  it('can be cancelled', async () => {
    const { emitted } = show({ target, add: vi.fn() })
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(emitted().cancel).toHaveLength(1)
  })
})
