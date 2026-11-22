import { fireEvent, render, screen, within } from '@testing-library/vue'
import { defineComponent, h, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import RowList from './RowList.vue'

/**
 * A list as a grid (#459): one Tab stop, the arrow keys moving between rows and their controls. Each row here has a
 * tick in its rail, a link, and two buttons; row b's second button is disabled, and row c can open a form of its own.
 */
type Item = { id: string }
const Harness = defineComponent({
  props: { items: { type: Array as () => Item[], required: true } },
  setup(props) {
    const editing = ref<string | null>(null)
    return () =>
      h(
        RowList<Item>,
        { items: props.items, grid: true, label: 'Things' },
        {
          rail: ({ item }: { item: Item }) =>
            h('div', { class: 'list-rail' }, [
              h('input', { type: 'checkbox', 'aria-label': `Select ${item.id}` }),
            ]),
          default: ({ item }: { item: Item }) =>
            editing.value === item.id
              ? h('form', { 'data-grid-own': '' }, [
                  h('input', { 'aria-label': `Name of ${item.id}` }),
                  h('button', { type: 'button', onClick: () => (editing.value = null) }, 'Done'),
                ])
              : h('a', { href: `#${item.id}` }, `Open ${item.id}`),
          actions: ({ item }: { item: Item }) => [
            h(
              'button',
              { type: 'button', onClick: () => (editing.value = item.id) },
              `Edit ${item.id}`,
            ),
            h(
              'button',
              {
                type: 'button',
                disabled: item.id === 'b',
                'data-grid-keys': item.id === 'c' ? 'vertical' : undefined,
              },
              `More ${item.id}`,
            ),
          ],
        },
      )
  },
})

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const stops = () => [...document.querySelectorAll<HTMLElement>('[role="grid"] [tabindex="0"]')]
const key = (key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.activeElement!, { key, ...init })
const named = (name: string): HTMLElement =>
  screen.queryByRole('button', { name }) ??
  screen.queryByRole('link', { name }) ??
  screen.queryByRole('checkbox', { name }) ??
  screen.getByRole('textbox', { name })

describe('RowList as a grid', () => {
  it('is a named grid of rows and cells, not a list', () => {
    render(Harness, { props: { items } })
    const grid = screen.getByRole('grid', { name: 'Things' })
    expect(within(grid).getAllByRole('row')).toHaveLength(3)
    expect(within(within(grid).getAllByRole('row')[0]!).getAllByRole('gridcell')).toHaveLength(2)
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('is one Tab stop: the first control, the first time', async () => {
    render(Harness, { props: { items } })
    await nextTick()
    expect(stops()).toEqual([named('Select a')])
    expect(named('Open b')).toHaveAttribute('tabindex', '-1')
  })

  it('moves along a row with Left and Right, and stops at its ends', async () => {
    render(Harness, { props: { items } })
    named('Select a').focus()
    await key('ArrowRight')
    expect(named('Open a')).toHaveFocus()
    await key('ArrowRight')
    await key('ArrowRight')
    expect(named('More a')).toHaveFocus()
    await key('ArrowRight')
    expect(named('More a')).toHaveFocus()
    await key('ArrowLeft')
    expect(named('Edit a')).toHaveFocus()
    // The Tab stop follows, so Tab comes back to where the person was.
    expect(stops()).toEqual([named('Edit a')])
  })

  it('moves between rows with Up and Down, at the same place or the row’s last control', async () => {
    render(Harness, { props: { items } })
    named('More a').focus()
    await key('ArrowDown')
    expect(named('Edit b')).toHaveFocus() // row b's More is disabled, so its last control is Edit
    await key('ArrowUp')
    expect(named('Edit a')).toHaveFocus()
    await key('ArrowUp')
    expect(named('Edit a')).toHaveFocus() // the first row: nowhere further
  })

  it('goes to the ends of a row with Home and End, and of the grid with Ctrl', async () => {
    render(Harness, { props: { items } })
    named('Open b').focus()
    await key('End')
    expect(named('Edit b')).toHaveFocus()
    await key('Home')
    expect(named('Select b')).toHaveFocus()
    await key('End', { ctrlKey: true })
    expect(named('More c')).toHaveFocus()
    await key('Home', { ctrlKey: true })
    expect(named('Select a')).toHaveFocus()
  })

  it('leaves Up and Down to a control that takes them itself', async () => {
    render(Harness, { props: { items } })
    named('More c').focus()
    await key('ArrowUp')
    expect(named('More c')).toHaveFocus()
    await key('ArrowLeft')
    expect(named('Edit c')).toHaveFocus() // Left and Right still move
  })

  it('leaves a form of a row’s own alone: its keys and its Tab order', async () => {
    render(Harness, { props: { items } })
    named('Edit c').focus()
    await fireEvent.click(named('Edit c'))
    await nextTick()
    const field = named('Name of c')
    expect(field).not.toHaveAttribute('tabindex')
    expect(named('Done')).not.toHaveAttribute('tabindex')
    field.focus()
    await key('ArrowLeft')
    expect(field).toHaveFocus()
    await key('ArrowDown')
    expect(field).toHaveFocus()
  })

  it('keeps one Tab stop when the row holding it goes, moving it to the row now in its place', async () => {
    const { rerender } = render(Harness, { props: { items } })
    named('Open b').focus()
    await rerender({ items: [{ id: 'a' }, { id: 'c' }] })
    await nextTick()
    expect(stops()).toEqual([named('Open c')])
  })
})
