import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import ReorderableList from './ReorderableList.vue'

interface Item {
  id: string
}
interface Call {
  ids: string[]
  moved: string
  resolve: (saved: boolean) => void
  reject: (error: Error) => void
}

/**
 * A list whose saves wait until the test answers them, inside a parent that keeps the saved order
 * the way the pages do (the answer to a save becomes `items`).
 */
function mountList(initial = ['a', 'b', 'c'], { pageFollowsSaves = true } = {}) {
  const items = ref<Item[]>(initial.map((id) => ({ id })))
  const calls: Call[] = []
  let inFlight = 0
  let mostInFlight = 0
  const save = (ids: string[], moved: Item) => {
    inFlight++
    mostInFlight = Math.max(mostInFlight, inFlight)
    return new Promise<boolean>((resolve, reject) => {
      calls.push({
        ids,
        moved: moved.id,
        resolve: (saved) => {
          inFlight--
          // What the page does with the saved list (or, in some tests, not yet).
          if (saved && pageFollowsSaves) items.value = ids.map((id) => ({ id }))
          resolve(saved)
        },
        reject: (error) => {
          inFlight--
          reject(error)
        },
      })
    })
  }
  const Parent = defineComponent({
    setup: () => () =>
      h(
        ReorderableList as never,
        { items: items.value, itemLabel: (item: Item) => item.id, save },
        { default: ({ item }: { item: Item }) => h('span', { 'data-row': item.id }, item.id) },
      ),
  })
  render(Parent)
  return { items, calls, mostInFlight: () => mostInFlight }
}

const order = () =>
  Array.from(document.querySelectorAll('[data-row]')).map((el) => el.textContent as string)
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('ReorderableList', () => {
  afterEach(() => vi.useRealTimers())

  it('shows a move at once, before the save has answered, and keeps focus on the moved row', async () => {
    const { calls } = mountList()
    await press('Move b up')
    expect(order()).toEqual(['b', 'a', 'c'])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ ids: ['b', 'a', 'c'], moved: 'b' })
    expect(screen.getByText('Moved b to position 1 of 3')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move b down' })).toHaveFocus())
  })

  it('keeps the arrows usable while a save is in flight', async () => {
    mountList()
    await press('Move b up')
    expect(screen.getByRole('button', { name: 'Move c up' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Move a down' })).toBeEnabled()
  })

  it('saves one at a time, and only the latest order once the first has answered', async () => {
    const { calls, items, mostInFlight } = mountList()
    await press('Move b up') // b a c, sent
    await press('Move c up') // b c a, waits
    await press('Move c up') // c b a, waits (replaces the one waiting)
    expect(order()).toEqual(['c', 'b', 'a'])
    expect(calls).toHaveLength(1)

    calls[0]!.resolve(true)
    // The answer to the first save is the older order; it must not undo the newer moves.
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(items.value.map((i) => i.id)).toEqual(['b', 'a', 'c'])
    expect(order()).toEqual(['c', 'b', 'a'])
    expect(calls[1]!.ids).toEqual(['c', 'b', 'a'])

    calls[1]!.resolve(true)
    await settle()
    expect(order()).toEqual(['c', 'b', 'a'])
    expect(calls).toHaveLength(2)
    expect(mostInFlight()).toBe(1)
  })

  it('does not flash the old order while the page catches up with a save', async () => {
    const { calls, items } = mountList(['a', 'b'], { pageFollowsSaves: false })
    await press('Move b up')
    calls[0]!.resolve(true)
    await settle() // the save has answered, but `items` still holds the old order
    expect(order()).toEqual(['b', 'a'])
    items.value = [{ id: 'b' }, { id: 'a' }]
    await settle()
    expect(order()).toEqual(['b', 'a'])
  })

  it('stops showing its own order a few seconds after a save if the page never agrees', async () => {
    vi.useFakeTimers()
    const { calls } = mountList(['a', 'b'], { pageFollowsSaves: false })
    await fireEvent.click(screen.getByRole('button', { name: 'Move b up' }))
    calls[0]!.resolve(true)
    await vi.advanceTimersByTimeAsync(100)
    expect(order()).toEqual(['b', 'a'])
    await vi.advanceTimersByTimeAsync(3500)
    expect(order()).toEqual(['a', 'b']) // what the page holds
  })

  it('goes back to the saved order when a save fails, says so, and drops moves that were waiting', async () => {
    const { calls } = mountList()
    await press('Move b up')
    await press('Move c up')
    calls[0]!.resolve(false)
    await waitFor(() => expect(order()).toEqual(['a', 'b', 'c']))
    expect(
      screen.getByText('The new order could not be saved. The list is back to the saved order.'),
    ).toBeInTheDocument()
    await settle()
    expect(calls).toHaveLength(1) // the waiting move was built on the order that didn't save
  })

  it('treats a save that throws like one that failed', async () => {
    const { calls } = mountList()
    await press('Move c up')
    calls[0]!.reject(new Error('offline'))
    await waitFor(() => expect(order()).toEqual(['a', 'b', 'c']))
  })

  it('lets the next move start fresh after a failure', async () => {
    const { calls } = mountList()
    await press('Move b up')
    calls[0]!.resolve(false)
    await waitFor(() => expect(order()).toEqual(['a', 'b', 'c']))
    await press('Move c up')
    expect(order()).toEqual(['a', 'c', 'b'])
    expect(calls).toHaveLength(2)
    expect(calls[1]!.ids).toEqual(['a', 'c', 'b'])
  })

  it('puts a row someone else added meanwhile at the end, and drops one that went', async () => {
    const { items } = mountList()
    await press('Move c up') // a c b, still saving
    items.value = [...items.value, { id: 'd' }]
    await settle()
    expect(order()).toEqual(['a', 'c', 'b', 'd'])
    items.value = items.value.filter((item) => item.id !== 'c')
    await settle()
    expect(order()).toEqual(['a', 'b', 'd'])
  })

  it('shows a drag and drop at once too', async () => {
    const { calls } = mountList()
    const dataTransfer = { setData() {}, setDragImage() {}, effectAllowed: '', dropEffect: '' }
    const rows = screen.getAllByRole('listitem')
    await fireEvent.dragStart(rows[2]!.querySelector('[data-testid="grip"]')!, { dataTransfer })
    await fireEvent.dragOver(rows[0]!, { clientY: -1, dataTransfer }) // jsdom boxes are empty: negative is "above"
    await fireEvent.drop(rows[0]!, { dataTransfer })
    expect(order()).toEqual(['c', 'a', 'b'])
    expect(calls[0]!.ids).toEqual(['c', 'a', 'b'])
  })

  it('builds the next move on the order shown, not the saved one', async () => {
    const { calls } = mountList()
    await press('Move b up') // b a c
    await press('Move b down') // back to a b c, built on the pending order
    expect(order()).toEqual(['a', 'b', 'c'])
    calls[0]!.resolve(true)
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]!.ids).toEqual(['a', 'b', 'c'])
  })
})
