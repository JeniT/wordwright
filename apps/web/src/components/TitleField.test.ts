import { fireEvent, render, screen } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
import TitleField from './TitleField.vue'

describe('TitleField', () => {
  const long = 'A very long title that will need several lines to be read on a narrow phone screen'

  it('is a textarea, so a long title can wrap, and shows the whole title', () => {
    render(TitleField, { props: { id: 't', modelValue: long } })
    const field = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(field.tagName).toBe('TEXTAREA')
    expect(field.value).toBe(long)
    expect(field).toHaveClass('resize-none')
  })

  it('asks the page to move on when Return is pressed, without adding a line break', async () => {
    const onEnter = vi.fn()
    render(TitleField, { props: { id: 't', modelValue: 'Title', onEnter } })
    const field = screen.getByRole('textbox')
    const press = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
    field.dispatchEvent(press)
    expect(press.defaultPrevented).toBe(true) // so no newline is typed
    expect(onEnter).toHaveBeenCalledOnce()
  })

  it('turns a pasted line break into a space', async () => {
    const updates: string[] = []
    render(TitleField, {
      props: { id: 't', modelValue: '', 'onUpdate:modelValue': (v: string) => updates.push(v) },
    })
    await fireEvent.update(screen.getByRole('textbox'), 'One\nTwo')
    expect(updates.at(-1)).toBe('One Two')
  })
})
