import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import type { Editor } from '@tiptap/vue-3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'
import RichEditor from './RichEditor.vue'

type Handle = {
  insertMarkdown: (markdown: string, at?: number) => boolean
  insertInlineMarkdown: (markdown: string) => boolean
  replaceRange: (from: number, to: number, text: string, expected: string) => boolean
}

function show(start = '', props: { editable?: boolean; markdownMode?: boolean } = {}) {
  const state = reactive({ markdown: start, markdownMode: props.markdownMode ?? false })
  const selections: unknown[] = []
  const handle = ref<Handle>()
  const Host = defineComponent({
    setup: () => () =>
      h(RichEditor, {
        ref: handle,
        modelValue: state.markdown,
        'onUpdate:modelValue': (value: string) => (state.markdown = value),
        markdownMode: state.markdownMode,
        'onUpdate:markdownMode': (value: boolean) => (state.markdownMode = value),
        editable: props.editable,
        onSelectionChange: (s: unknown) => selections.push(s),
      }),
  })
  render(Host)
  const editor = () =>
    (document.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
  return { state, handle, selections, editor }
}

const button = (name: string) => screen.getByRole('button', { name })
const box = () =>
  screen.getByRole('textbox', { name: 'Draft body, as Markdown' }) as HTMLTextAreaElement

afterEach(() => vi.unstubAllGlobals())

describe('RichEditor toolbar', () => {
  it('offers the draft’s formatting as named icon buttons, with the text styles as one group', async () => {
    show('Words')
    await screen.findByRole('textbox', { name: 'Draft body' })
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' })
    const names = [...toolbar.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual([
      'Paragraph',
      'Heading 2',
      'Heading 3',
      'Bold',
      'Italic',
      'Inline code',
      'Quote',
      'Bulleted list',
      'Numbered list',
      'Code block',
      'Link',
      'Edit as Markdown',
    ])
    const styles = within(toolbar).getByRole('group', { name: 'Text style' })
    expect(within(styles).getAllByRole('button')).toHaveLength(3)
  })

  it('has no toolbar for someone who may only read the draft', async () => {
    show('Words', { editable: false })
    await screen.findByRole('textbox', { name: 'Draft body' })
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('sets a heading level with the three-way control, and says which is on', async () => {
    const { editor, state } = show('A title\n\nSome words')
    await screen.findByRole('textbox', { name: 'Draft body' })
    editor().commands.setTextSelection(3)
    await fireEvent.click(button('Heading 2'))
    expect(state.markdown).toBe('## A title\n\nSome words')
    await waitFor(() => expect(button('Heading 2')).toHaveAttribute('aria-pressed', 'true'))
    await fireEvent.click(button('Heading 3'))
    expect(state.markdown).toBe('### A title\n\nSome words')
    await fireEvent.click(button('Paragraph'))
    expect(state.markdown).toBe('A title\n\nSome words')
  })

  it.each([
    ['Quote', /^> Quoted words$/],
    ['Inline code', /^`Quoted words`$/],
    ['Code block', /^```\s*\nQuoted words\n```$/],
    ['Bulleted list', /^- Quoted words$/],
  ])('applies %s to the selected words', async (name, expected) => {
    const { editor, state } = show('Quoted words')
    await screen.findByRole('textbox', { name: 'Draft body' })
    editor().commands.setTextSelection({ from: 1, to: 13 }) // not select-all: that takes in the empty line kept after the text
    await fireEvent.click(button(name))
    expect(state.markdown.trimEnd()).toMatch(expected)
    await waitFor(() => expect(button(name)).toHaveAttribute('aria-pressed', 'true'))
  })

  it('puts a link in through a dialog', async () => {
    const { editor, state } = show('Visit our site')
    await screen.findByRole('textbox', { name: 'Draft body' })
    editor().commands.selectAll()
    await fireEvent.click(button('Link'))
    const dialog = await screen.findByRole('dialog', { name: 'Add a link' })
    await fireEvent.update(within(dialog).getByLabelText('Link address'), 'example.com')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Add link' }))
    expect(state.markdown).toBe('[Visit our site](https://example.com)')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('moves the buttons that do not fit into a More menu', async () => {
    let notify: () => void = () => {}
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          notify = cb
        }
        observe() {}
        disconnect() {}
      },
    )
    show('Words')
    await screen.findByRole('textbox', { name: 'Draft body' })
    const bar = screen.getByRole('toolbar')
    Object.defineProperty(bar, 'clientWidth', { value: 230, configurable: true }) // room for about five
    notify()
    const more = await screen.findByRole('button', { name: 'More formatting' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Link' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit as Markdown' })).toBeInTheDocument()

    await fireEvent.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('group', { name: 'More formatting' })
    await waitFor(() => expect(within(menu).getAllByRole('button')[0]).toHaveFocus()) // into the menu
    expect(within(menu).getByRole('button', { name: 'Link' })).toBeInTheDocument()
    await fireEvent.keyDown(more, { key: 'Escape' })
    expect(screen.queryByRole('group', { name: 'More formatting' })).toBeNull()
    await waitFor(() => expect(more).toHaveFocus())
  })
})

describe('RichEditor in Markdown mode', () => {
  it('shows the Markdown in a text box, and typing in it changes the text', async () => {
    const { state } = show('Some **bold** words', { markdownMode: true })
    expect(box().value).toBe('Some **bold** words')
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull() // the formatting buttons are hidden
    expect(button('Edit as Markdown')).toHaveAttribute('aria-pressed', 'true')
    expect(button('Edit as Markdown').tabIndex).toBe(0) // the toggle is the bar's tab stop, so the keyboard can reach it
    await fireEvent.update(box(), 'Some **bold** words and a [link](https://example.com)')
    expect(state.markdown).toBe('Some **bold** words and a [link](https://example.com)')
  })

  it('switches with the button, keeping the words, and does not rewrite them on the way', async () => {
    const { state } = show('A *tricky*  spacing_case', {})
    await screen.findByRole('textbox', { name: 'Draft body' })
    await fireEvent.click(button('Edit as Markdown'))
    expect(box().value).toBe('A *tricky*  spacing_case') // exactly as it was saved
    await fireEvent.update(box(), 'A *tricky*  spacing_case and more')
    await fireEvent.click(button('Edit as Markdown'))
    await waitFor(() =>
      expect(document.querySelector('.ProseMirror')!.textContent).toContain('and more'),
    )
    expect(state.markdown).toBe('A *tricky*  spacing_case and more') // switching back is not an edit
    expect(state.markdownMode).toBe(false)
  })

  it('reports the selection as offsets in the text, and replaces it for Rephrase', async () => {
    const { state, handle, selections } = show('One two three four five six', {
      markdownMode: true,
    })
    const text = box()
    text.setSelectionRange(4, 18)
    await fireEvent.select(text)
    expect(selections.at(-1)).toEqual({
      from: 4,
      to: 18,
      text: 'two three four',
      sameBlock: true,
    })
    expect(handle.value!.replaceRange(4, 18, 'twos', 'two three four')).toBe(true)
    expect(state.markdown).toBe('One twos five six')
    expect(handle.value!.replaceRange(0, 3, 'Uno', 'Two')).toBe(false) // not what it was
    expect(state.markdown).toBe('One twos five six')
  })

  it('adds a note after the paragraph the cursor is in, and a link at the cursor', async () => {
    const { state, handle } = show('First paragraph.\n\nSecond paragraph.', { markdownMode: true })
    const text = box()
    await fireEvent.focus(text)
    text.setSelectionRange(5, 5)
    expect(handle.value!.insertMarkdown('- a note')).toBe(true)
    expect(state.markdown).toBe('First paragraph.\n\n- a note\n\nSecond paragraph.')
    await nextTick() // the parent hands the new text back
    const at = state.markdown.indexOf('Second') + 6
    text.setSelectionRange(at, at)
    expect(handle.value!.insertInlineMarkdown(' [Title](https://example.com)')).toBe(true)
    expect(state.markdown).toBe(
      'First paragraph.\n\n- a note\n\nSecond [Title](https://example.com) paragraph.',
    )
  })

  it('hands a dropped note to its parent, to go where the cursor is', async () => {
    const dropped: unknown[] = []
    const Host = defineComponent({
      setup: () => () =>
        h(RichEditor, {
          modelValue: 'Words',
          markdownMode: true,
          editable: true,
          onNoteDrop: (...args: unknown[]) => dropped.push(args),
        }),
    })
    render(Host)
    const data = { types: ['application/x-wordwright-note'], getData: () => 'n1', dropEffect: '' }
    await fireEvent.drop(box(), { dataTransfer: data })
    expect(dropped).toEqual([['n1', undefined]])
  })
})
