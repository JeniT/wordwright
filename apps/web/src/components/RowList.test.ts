import { render, screen, within } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import RowList from './RowList.vue'

const items = [{ id: 'a' }, { id: 'b' }]
const slots = {
  default: ({ item }: { item: { id: string } }) => `Row ${item.id}`,
  actions: ({ item }: { item: { id: string } }) => `Act ${item.id}`,
}

describe('RowList', () => {
  it('is a named list with one item per row, holding the content and then the actions', () => {
    render(RowList, { props: { items, label: 'Things' }, slots })
    const list = screen.getByRole('list', { name: 'Things' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toHaveTextContent('Row b')
    expect(rows[1]).toHaveTextContent('Act b')
  })

  it('is numbered when its order means something', () => {
    render(RowList, { props: { items, ordered: true }, slots })
    expect(document.querySelector('ol')).not.toBeNull()
  })

  it('leaves out the actions zone when a row has none', () => {
    render(RowList, { props: { items }, slots: { default: slots.default } })
    expect(screen.getAllByRole('listitem')[0]!.querySelector('span.shrink-0')).toBeNull()
  })
})
