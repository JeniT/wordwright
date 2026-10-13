import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import type { Editor } from '@tiptap/vue-3'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'
import DescriptionEditor from './DescriptionEditor.vue'

/**
 * jsdom cannot type into a rich-text editor, so these drive it the way the toolbar does: through the editor itself
 * (a selection, a command) and then the buttons, and read back the Markdown it hands to its parent.
 */
function show(start = '', props: { maxlength?: number; hint?: string } = {}) {
  const state = reactive({ markdown: start })
  const written: string[] = []
  const handle = ref<{ editor: Editor | undefined }>()
  const Host = defineComponent({
    setup: () => () =>
      h(DescriptionEditor, {
        ref: handle,
        label: 'About this venue',
        modelValue: state.markdown,
        'onUpdate:modelValue': (value: string) => {
          written.push(value)
          state.markdown = value
        },
        ...props,
      }),
  })
  render(Host)
  const editor = () => handle.value!.editor!
  return { state, written, editor }
}

const button = (name: string) => screen.getByRole('button', { name })

describe('DescriptionEditor', () => {
  it('is a labelled text box with a labelled toolbar, and shows Markdown as formatted text', async () => {
    show('Weeknotes, **mostly for me**.\n\n- one\n- two\n\nSee [home](https://example.com).', {
      hint: 'What it is.',
    })
    const box = await screen.findByRole('textbox', { name: 'About this venue' })
    expect(box).toHaveAttribute('aria-multiline', 'true')
    expect(box).toHaveAccessibleDescription('What it is.')
    expect(box.querySelector('strong')).toHaveTextContent('mostly for me')
    expect([...box.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['one', 'two'])
    expect(box.querySelector('a')).toHaveAttribute('href', 'https://example.com')
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' })
    expect(toolbar.querySelectorAll('button')).toHaveLength(5)
  })

  it('writes nothing back until the writer changes something, so untouched words are saved as they were', async () => {
    const { written, state } = show(
      'A *tricky* description_with_marks and a [link](https://example.com).',
    )
    await screen.findByRole('textbox')
    await nextTick()
    expect(written).toEqual([])
    expect(state.markdown).toBe(
      'A *tricky* description_with_marks and a [link](https://example.com).',
    )
  })

  it('takes words that arrive from outside, such as an AI draft, without writing them back', async () => {
    const { written, state } = show('')
    await screen.findByRole('textbox')
    state.markdown = 'A **drafted** description.'
    await waitFor(() =>
      expect(screen.getByRole('textbox').querySelector('strong')).toHaveTextContent('drafted'),
    )
    await nextTick()
    expect(written).toEqual([]) // nothing "changed" by being shown
    expect(state.markdown).toBe('A **drafted** description.')
  })

  it('makes the selected words bold or italic, and says which is on', async () => {
    const { editor, state } = show('Some words')
    await screen.findByRole('textbox')
    editor().commands.selectAll()
    await fireEvent.click(button('Bold'))
    expect(state.markdown).toBe('**Some words**')
    expect(button('Bold')).toHaveAttribute('aria-pressed', 'true')
    expect(button('Italic')).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.click(button('Bold')) // off again
    expect(state.markdown).toBe('Some words')
    await fireEvent.click(button('Italic'))
    expect(state.markdown).toMatch(/^[*_]Some words[*_]$/)
  })

  it('makes lists, bulleted and numbered', async () => {
    const { editor, state } = show('First\n\nSecond')
    await screen.findByRole('textbox')
    editor().commands.selectAll()
    await fireEvent.click(button('Bulleted list'))
    expect(state.markdown).toBe('- First\n- Second')
    await waitFor(() => expect(button('Bulleted list')).toHaveAttribute('aria-pressed', 'true'))
    await fireEvent.click(button('Numbered list'))
    expect(state.markdown).toBe('1. First\n2. Second')
  })

  it('turns selected words into a link, tidying the address, with a field that takes the focus and gives it back', async () => {
    const { editor, state } = show('Visit our site')
    await screen.findByRole('textbox')
    editor().commands.selectAll()
    await fireEvent.click(button('Link'))
    const field = screen.getByLabelText('Link address')
    await waitFor(() => expect(field).toHaveFocus())
    expect(button('Link')).toHaveAttribute('aria-expanded', 'true')
    await fireEvent.update(field, ' example.com/about ')
    await fireEvent.click(button('Add link'))
    expect(state.markdown).toBe('[Visit our site](https://example.com/about)')
    expect(screen.queryByLabelText('Link address')).toBeNull()
    await waitFor(() => expect(button('Link')).toHaveFocus())
  })

  it('uses the address as the text when no words are selected', async () => {
    const { editor, state } = show('')
    await screen.findByRole('textbox')
    editor().commands.focus()
    await fireEvent.click(button('Link'))
    await fireEvent.update(screen.getByLabelText('Link address'), 'https://example.com')
    await fireEvent.click(button('Add link'))
    expect(state.markdown).toBe('[https://example.com](https://example.com)')
  })

  it('refuses an address that is not a web or email address, and says what to enter', async () => {
    const { editor, state } = show('Words')
    await screen.findByRole('textbox')
    editor().commands.selectAll()
    await fireEvent.click(button('Link'))
    for (const bad of ['javascript:alert(1)', 'two words', '  ']) {
      await fireEvent.update(screen.getByLabelText('Link address'), bad)
      await fireEvent.click(button('Add link'))
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Enter a web address, like https://example.com',
      )
      expect(screen.getByLabelText('Link address')).toHaveAttribute('aria-invalid', 'true')
    }
    expect(state.markdown).toBe('Words')
    await fireEvent.update(screen.getByLabelText('Link address'), 'mailto:ada@example.com')
    await fireEvent.click(button('Add link'))
    expect(state.markdown).toBe('[Words](mailto:ada@example.com)')
  })

  it('shows the link’s address to change or remove, and Escape closes the field', async () => {
    const { editor, state } = show('See [home](https://example.com).')
    await screen.findByRole('textbox')
    editor().commands.setTextSelection(7) // inside "home"
    await waitFor(() => expect(button('Link')).toHaveAttribute('aria-pressed', 'true'))
    await fireEvent.click(button('Link'))
    expect(screen.getByLabelText('Link address')).toHaveValue('https://example.com')
    await fireEvent.update(screen.getByLabelText('Link address'), 'https://example.org')
    await fireEvent.click(button('Add link'))
    expect(state.markdown).toBe('See [home](https://example.org).')

    editor().commands.setTextSelection(7)
    await fireEvent.click(button('Link'))
    await fireEvent.click(button('Remove link'))
    expect(state.markdown).toBe('See home.')

    await fireEvent.click(button('Link'))
    await fireEvent.keyDown(screen.getByLabelText('Link address'), { key: 'Escape' })
    expect(screen.queryByLabelText('Link address')).toBeNull()
  })

  it('offers only what a description can show: pasted headings are flattened, and nothing is saved as HTML', async () => {
    const { editor, state } = show('')
    await screen.findByRole('textbox')
    editor().commands.insertContent(
      '<h1>Big</h1><p>Text with <u>underline</u> and <code>code</code></p>',
    )
    await nextTick()
    const box = screen.getByRole('textbox')
    expect(box.querySelector('h1, u, code')).toBeNull()
    expect(state.markdown).not.toMatch(/<|#|`/)
    expect(state.markdown).toContain('Big')
    expect(state.markdown).toContain('underline')
  })

  it('says how far over the limit it is, and nothing before', async () => {
    const { state } = show('Short', { maxlength: 20 })
    await screen.findByRole('textbox')
    expect(screen.queryByRole('alert')).toBeNull()
    state.markdown = 'x'.repeat(26)
    expect(await screen.findByRole('alert')).toHaveTextContent('6 characters over the limit of 20')
    state.markdown = 'x'.repeat(21)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('1 character over'))
  })
})
