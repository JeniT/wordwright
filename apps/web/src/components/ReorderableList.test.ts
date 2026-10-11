import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { showArrows } from '../test-utils'
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
async function mountList(
  initial = ['a', 'b', 'c'],
  { pageFollowsSaves = true, arrows = true } = {},
) {
  const items = ref<Item[]>(initial.map((id) => ({ id })))
  const calls: Call[] = []
  let inFlight = 0
  let mostInFlight = 0
  let renders = 0
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
        {
          default: ({ item }: { item: Item }) => {
            renders++
            return h('span', { 'data-row': item.id }, item.id)
          },
        },
      ),
  })
  render(Parent)
  if (arrows) await showArrows()
  else await screen.findAllByRole('button', { name: /^Reorder / })
  return { items, calls, mostInFlight: () => mostInFlight, renders: () => renders }
}

const order = () =>
  Array.from(document.querySelectorAll('[data-row]')).map((el) => el.textContent as string)
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
/** jsdom has no layout, so a row's box is empty at y = 0: a positive clientY is its bottom half, a negative its top. */
const dragOver = (row: Element, clientY: number, dataTransfer: object) => {
  const event = createEvent.dragOver(row, { dataTransfer })
  Object.defineProperty(event, 'clientY', { value: clientY })
  return fireEvent(row, event)
}

describe('ReorderableList', () => {
  afterEach(() => vi.useRealTimers())

  it('keeps the arrows out of sight until a row’s grip is pressed, and puts them away again', async () => {
    await mountList(['a', 'b'], { arrows: false })
    expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument()
    const grip = screen.getByRole('button', { name: 'Reorder b' })
    expect(grip).toHaveAttribute('aria-expanded', 'false')
    await fireEvent.click(grip)
    expect(grip).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Move b up' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Move a down' })).not.toBeInTheDocument() // only that row's
    await fireEvent.click(grip)
    expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument()
  })

  it('moves a row with the arrow keys on its grip, keeping focus on the grip', async () => {
    const { calls } = await mountList(['a', 'b', 'c'], { arrows: false })
    const grip = screen.getByRole('button', { name: 'Reorder b' })
    grip.focus()
    await fireEvent.keyDown(grip, { key: 'ArrowUp' })
    expect(order()).toEqual(['b', 'a', 'c'])
    expect(calls[0]!.ids).toEqual(['b', 'a', 'c'])
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reorder b' })).toHaveFocus())
    await fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder b' }), { key: 'ArrowUp' })
    expect(order()).toEqual(['b', 'a', 'c']) // already first: nothing to do
  })

  it('shows a move at once, before the save has answered, and keeps focus on the moved row', async () => {
    const { calls } = await mountList()
    await press('Move b up')
    expect(order()).toEqual(['b', 'a', 'c'])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ ids: ['b', 'a', 'c'], moved: 'b' })
    expect(screen.getByText('Moved b to position 1 of 3')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move b down' })).toHaveFocus())
  })

  it('keeps the arrows usable while a save is in flight', async () => {
    await mountList()
    await press('Move b up')
    expect(screen.getByRole('button', { name: 'Move c up' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Move a down' })).toBeEnabled()
  })

  it('saves one at a time, and only the latest order once the first has answered', async () => {
    const { calls, items, mostInFlight } = await mountList()
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
    const { calls, items } = await mountList(['a', 'b'], { pageFollowsSaves: false })
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
    const { calls } = await mountList(['a', 'b'], { pageFollowsSaves: false })
    await fireEvent.click(screen.getByRole('button', { name: 'Move b up' }))
    calls[0]!.resolve(true)
    await vi.advanceTimersByTimeAsync(100)
    expect(order()).toEqual(['b', 'a'])
    await vi.advanceTimersByTimeAsync(3500)
    expect(order()).toEqual(['a', 'b']) // what the page holds
  })

  it('goes back to the saved order when a save fails, says so, and drops moves that were waiting', async () => {
    const { calls } = await mountList()
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
    const { calls } = await mountList()
    await press('Move c up')
    calls[0]!.reject(new Error('offline'))
    await waitFor(() => expect(order()).toEqual(['a', 'b', 'c']))
  })

  it('lets the next move start fresh after a failure', async () => {
    const { calls } = await mountList()
    await press('Move b up')
    calls[0]!.resolve(false)
    await waitFor(() => expect(order()).toEqual(['a', 'b', 'c']))
    await press('Move c up')
    expect(order()).toEqual(['a', 'c', 'b'])
    expect(calls).toHaveLength(2)
    expect(calls[1]!.ids).toEqual(['a', 'c', 'b'])
  })

  it('puts a row someone else added meanwhile at the end, and drops one that went', async () => {
    const { items } = await mountList()
    await press('Move c up') // a c b, still saving
    items.value = [...items.value, { id: 'd' }]
    await settle()
    expect(order()).toEqual(['a', 'c', 'b', 'd'])
    items.value = items.value.filter((item) => item.id !== 'c')
    await settle()
    expect(order()).toEqual(['a', 'b', 'd'])
  })

  it('shows a drag and drop at once too', async () => {
    const { calls } = await mountList()
    const dataTransfer = { setData() {}, setDragImage() {}, effectAllowed: '', dropEffect: '' }
    const rows = screen.getAllByRole('listitem')
    await fireEvent.dragStart(rows[2]!.querySelector('[data-testid="rail"]')!, { dataTransfer })
    await dragOver(rows[0]!, -1, dataTransfer)
    await fireEvent.drop(rows[0]!, { dataTransfer })
    expect(order()).toEqual(['c', 'a', 'b'])
    expect(calls[0]!.ids).toEqual(['c', 'a', 'b'])
  })

  it('carries a small label while dragging, not a picture of the whole row, and tidies it away', async () => {
    await mountList()
    const setDragImage = vi.fn()
    const dataTransfer = { setData() {}, setDragImage, effectAllowed: '', dropEffect: '' }
    const rows = screen.getAllByRole('listitem')
    await fireEvent.dragStart(rows[2]!.querySelector('[data-testid="rail"]')!, { dataTransfer })
    expect(setDragImage).toHaveBeenCalledTimes(1)
    const image = setDragImage.mock.calls[0]![0] as HTMLElement
    expect(rows.some((row) => row === image || row.contains(image))).toBe(false)
    expect(image).toHaveTextContent('c')
    expect(image.getAttribute('aria-hidden')).toBe('true')
    expect(document.body.contains(image)).toBe(true) // the browser copies it while it is in the page
    await settle()
    expect(document.body.contains(image)).toBe(false)
  })

  it('does not redraw the list for a dragover that changes nothing', async () => {
    const { renders } = await mountList()
    const dataTransfer = { setData() {}, setDragImage() {}, effectAllowed: '', dropEffect: '' }
    const rows = screen.getAllByRole('listitem')
    await fireEvent.dragStart(rows[2]!.querySelector('[data-testid="rail"]')!, { dataTransfer })
    await dragOver(rows[0]!, -1, dataTransfer)
    await settle()
    const drawn = renders()
    for (let i = 0; i < 5; i++) await dragOver(rows[0]!, -1, dataTransfer)
    await settle()
    expect(renders()).toBe(drawn) // the same place, said again
    await dragOver(rows[0]!, 1, dataTransfer) // the other half of the row
    await settle()
    expect(renders()).toBeGreaterThan(drawn)
  })

  it('builds the next move on the order shown, not the saved one', async () => {
    const { calls } = await mountList()
    await press('Move b up') // b a c
    await press('Move b down') // back to a b c, built on the pending order
    expect(order()).toEqual(['a', 'b', 'c'])
    calls[0]!.resolve(true)
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]!.ids).toEqual(['a', 'b', 'c'])
  })
})
