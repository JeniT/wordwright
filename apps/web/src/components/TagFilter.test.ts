import { fireEvent, render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import TagFilter from './TagFilter.vue'

const tags = ['intro', 'part 2', 'sources']
const box = () => screen.getByRole('combobox', { name: 'Filter by tag' }) as HTMLInputElement
const options = () => screen.queryAllByRole('option').map((o) => o.textContent?.trim())
const press = (key: string) => fireEvent.keyDown(box(), { key })

describe('TagFilter', () => {
  it('is not shown until something has a tag', () => {
    render(TagFilter, { props: { tags: [], modelValue: [] } })
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('is a text box that suggests the tags in use, with no "All"', async () => {
    render(TagFilter, { props: { tags, modelValue: [] } })
    expect(box()).toHaveAttribute('aria-expanded', 'false')
    await fireEvent.focus(box())
    expect(box()).toHaveAttribute('aria-expanded', 'true')
    expect(options()).toEqual(['intro', 'part 2', 'sources'])
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull()
  })

  it('narrows the suggestions as you type, ignoring case', async () => {
    render(TagFilter, { props: { tags, modelValue: [] } })
    await fireEvent.update(box(), 'PART')
    expect(options()).toEqual(['part 2'])
  })

  it('moves through the suggestions with the arrow keys and adds the active one on Return, keeping focus', async () => {
    const { emitted } = render(TagFilter, { props: { tags, modelValue: ['intro'] } })
    box().focus()
    await press('ArrowDown')
    await press('ArrowDown')
    const active = screen.getByRole('option', { name: 'sources' })
    expect(box()).toHaveAttribute('aria-activedescendant', active.id)
    await press('Enter')
    expect(emitted()['update:modelValue']).toEqual([[['intro', 'sources']]])
    expect(box()).toHaveFocus()
    expect(box().value).toBe('')
  })

  it('adds a tag typed in full on Return, matching it to the list’s spelling', async () => {
    const { emitted } = render(TagFilter, { props: { tags, modelValue: [] } })
    await fireEvent.update(box(), 'Part 2')
    await press('Enter')
    expect(emitted()['update:modelValue']).toEqual([[['part 2']]])
  })

  it('adds a suggestion when it is clicked', async () => {
    const { emitted } = render(TagFilter, { props: { tags, modelValue: [] } })
    await fireEvent.focus(box())
    await fireEvent.mouseDown(screen.getByRole('option', { name: 'sources' }))
    expect(emitted()['update:modelValue']).toEqual([[['sources']]])
  })

  it('refuses a tag nothing has, with a message that goes when you type again', async () => {
    const { emitted } = render(TagFilter, { props: { tags, modelValue: [] } })
    await fireEvent.update(box(), 'zebra')
    await press('Enter')
    expect(emitted()['update:modelValue']).toBeUndefined()
    expect(screen.getByRole('alert')).toHaveTextContent('No notes or links are tagged “zebra”')
    expect(box()).toHaveAttribute('aria-invalid', 'true')
    await fireEvent.update(box(), 'ze')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('closes the suggestions on Escape', async () => {
    render(TagFilter, { props: { tags, modelValue: [] } })
    await fireEvent.focus(box())
    await press('Escape')
    expect(box()).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows a removable chip for each chosen tag, and stops suggesting it', async () => {
    const { emitted } = render(TagFilter, { props: { tags, modelValue: ['intro', 'part 2'] } })
    await fireEvent.focus(box())
    expect(options()).toEqual(['sources'])
    expect(screen.getByText('intro')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Stop filtering by intro' }))
    expect(emitted()['update:modelValue']).toEqual([[['part 2']]])
  })

  it('keeps the chips when every tag has been chosen, and matches tags ignoring case', () => {
    render(TagFilter, { props: { tags: ['Intro'], modelValue: ['intro'] } })
    expect(screen.getByRole('button', { name: 'Stop filtering by intro' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})
