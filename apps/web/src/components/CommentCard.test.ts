import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
import type { DraftComment } from '@wordwright/core'
import CommentCard from './CommentCard.vue'

const entry: DraftComment & { number: number } = {
  id: 'c1',
  number: 2,
  byAi: false,
  authorId: 'u1',
  authorName: 'Bob',
  reviewId: null,
  block: 'b1',
  excerpt: 'First',
  quote: null,
  blockText: null,
  hash: null,
  text: 'This drags.',
  reason: null,
  resolved: false,
  edited: false,
  createdAt: '2026-01-01T00:00:00Z',
}
const show = (props: Record<string, unknown>) =>
  render(CommentCard, {
    props: { entry, kind: 'static', ...props },
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
  })

describe('CommentCard', () => {
  it('offers Text changed as an icon button with its name, only when the text changed', async () => {
    const { emitted, unmount } = show({ textChanged: true })
    await fireEvent.click(screen.getByRole('button', { name: 'Text changed: comment 2' }))
    expect(emitted().showChange).toHaveLength(1)
    unmount()
    show({ textChanged: true, entry: { ...entry, resolved: true } })
    expect(screen.queryByRole('button', { name: /Text changed/ })).toBeNull()
  })

  it('has no Edit or Delete unless the viewer can change it', () => {
    show({})
    expect(screen.queryByRole('button', { name: 'Edit comment 2' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete comment 2' })).toBeNull()
  })

  it('rewords in place, then closes with focus back on Edit; Escape or Cancel leaves it alone', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    show({ canChange: true, save, remove: vi.fn() })
    await fireEvent.click(screen.getByRole('button', { name: 'Edit comment 2' }))
    const field = screen.getByLabelText('Your comment')
    await waitFor(() => expect(field).toHaveFocus())
    expect(field).toHaveValue('This drags.')
    await fireEvent.keyDown(field, { key: 'Escape' })
    expect(screen.queryByLabelText('Your comment')).toBeNull()
    expect(save).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit comment 2' })).toHaveFocus(),
    )

    await fireEvent.click(screen.getByRole('button', { name: 'Edit comment 2' }))
    await fireEvent.update(screen.getByLabelText('Your comment'), 'Drags less.')
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(save).toHaveBeenCalledWith('Drags less.'))
    await waitFor(() => expect(screen.queryByLabelText('Your comment')).toBeNull())
  })

  it('keeps the form and says why when the save fails', async () => {
    const save = vi.fn().mockRejectedValue(new Error('Check your connection and try again.'))
    show({ canChange: true, save, remove: vi.fn() })
    await fireEvent.click(screen.getByRole('button', { name: 'Edit comment 2' }))
    await fireEvent.update(screen.getByLabelText('Your comment'), 'New words')
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Check your connection')
    expect(screen.getByLabelText('Your comment')).toHaveValue('New words')
  })

  it('marks an edited comment', () => {
    show({ entry: { ...entry, edited: true } })
    expect(screen.getByText('edited')).toBeInTheDocument()
  })

  it('deletes only after a second tap, and says so when it could not', async () => {
    const remove = vi.fn().mockRejectedValue(new Error('no'))
    show({ canChange: true, save: vi.fn(), remove })
    const del = screen.getByRole('button', { name: 'Delete comment 2' })
    await fireEvent.click(del)
    expect(remove).not.toHaveBeenCalled()
    await fireEvent.click(del)
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t delete')
  })
})
