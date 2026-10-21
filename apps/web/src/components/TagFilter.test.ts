import { fireEvent, render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import TagFilter from './TagFilter.vue'

const tags = ['intro', 'part 2', 'sources']

describe('TagFilter', () => {
  it('is not shown until something has a tag', () => {
    render(TagFilter, { props: { tags: [], modelValue: [] } })
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('offers the tags in use in a "Filter by tag" select, with no "All"', () => {
    render(TagFilter, { props: { tags, modelValue: [] } })
    const select = screen.getByRole('combobox', { name: 'Filter by tag' })
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent?.trim())).toEqual(
      ['Choose a tag', 'intro', 'part 2', 'sources'],
    )
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull()
  })

  it('adds a tag to the filter when one is chosen, and returns the select to its prompt', async () => {
    const { emitted } = render(TagFilter, { props: { tags, modelValue: ['intro'] } })
    const select = screen.getByRole('combobox', { name: 'Filter by tag' }) as HTMLSelectElement
    await fireEvent.update(select, 'part 2')
    expect(emitted()['update:modelValue']).toEqual([[['intro', 'part 2']]])
    expect(select.value).toBe('')
  })

  it('shows a removable chip for each chosen tag, and stops offering it in the select', async () => {
    const { emitted } = render(TagFilter, { props: { tags, modelValue: ['intro', 'part 2'] } })
    const select = screen.getByRole('combobox', { name: 'Filter by tag' })
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent?.trim())).toEqual(
      ['Choose a tag', 'sources'],
    )
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
