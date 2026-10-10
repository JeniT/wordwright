<script setup lang="ts">
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { watch } from 'vue'
import { NOTE_DRAG_TYPE } from '../lib/note-drag'

const model = defineModel<string>({ required: true })
const emit = defineEmits<{
  /** A note from the side bar was dropped on the text, at this position in it (unknown when it can't be worked out). */
  noteDrop: [noteId: string, position: number | undefined]
}>()

/** Whether the writer has put the cursor in the text yet; until then insertions go at the end. */
let touched = false

const editor = useEditor({
  content: model.value,
  contentType: 'markdown',
  extensions: [
    // A plain click puts the cursor in the link to edit it; Ctrl or Cmd with the click opens it (see handleClick).
    StarterKit.configure({
      link: { openOnClick: false },
      dropcursor: { color: '#2f5d62', width: 2 }, // shows where a dragged note will land
    }),
    Markdown,
    Placeholder.configure({ placeholder: 'Start writing…' }),
  ],
  editorProps: {
    attributes: { 'aria-label': 'Draft body', role: 'textbox', 'aria-multiline': 'true' },
    handleDOMEvents: {
      // Notes dragged from the side bar land where they are dropped. These are DOM-level handlers, ahead of
      // ProseMirror's own drop handling, which only calls its `handleDrop` once it has worked out a position.
      dragover: (_view, event) => {
        if (event.dataTransfer?.types.includes(NOTE_DRAG_TYPE))
          event.dataTransfer.dropEffect = 'copy'
        return false // the drop cursor still follows the pointer
      },
      drop: (view, event) => {
        const id = event.dataTransfer?.types.includes(NOTE_DRAG_TYPE)
          ? event.dataTransfer.getData(NOTE_DRAG_TYPE)
          : ''
        if (!id) return false // something else (a file, some text) is dropped: the editor's own business
        event.preventDefault()
        let position: number | undefined
        try {
          position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        } catch {
          position = undefined
        }
        emit('noteDrop', id, position)
        return true
      },
      click: (_view, event) => {
        const link = (event.target as HTMLElement).closest('a')
        if (!link || !(event.ctrlKey || event.metaKey)) return false
        event.preventDefault()
        window.open(link.href, '_blank', 'noopener')
        return true
      },
    },
  },
  onFocus: () => {
    touched = true
  },
  onUpdate: ({ editor }) => {
    model.value = editor.getMarkdown()
  },
})

/**
 * Puts Markdown into the text as its own paragraph(s): at `at` if given (a drop), otherwise after the one the cursor
 * is in (or at the end, if the cursor has never been in the text). Returns false if the editor isn't ready. The change reaches `model` through
 * the editor's own update, like typing.
 */
function insertMarkdown(markdown: string, at?: number): boolean {
  const e = editor.value
  if (!e) return false
  // Dropped on the text: exactly there (a paragraph there is split to make room for it).
  if (at !== undefined) {
    const position = Math.min(Math.max(at, 0), e.state.doc.content.size)
    return e.chain().focus().insertContentAt(position, markdown, { contentType: 'markdown' }).run()
  }
  if (!touched) e.commands.focus('end')
  const { $to } = e.state.selection
  // Inside a paragraph that has words, go after it rather than splitting it; an empty one is filled in place.
  const target = $to.parent.textContent.length ? $to.after() : $to.pos
  return e.chain().focus().insertContentAt(target, markdown, { contentType: 'markdown' }).run()
}
/** Puts Markdown (a link) into the line where the cursor is, without starting a new paragraph. */
function insertInlineMarkdown(markdown: string): boolean {
  const e = editor.value
  if (!e) return false
  if (!touched) e.commands.focus('end')
  // Parsed as a paragraph, of which only the inline content (the link and its text) goes into the current line.
  const inline = e.markdown?.parse(markdown).content?.[0]?.content
  if (!inline) return false
  return e.chain().focus().insertContent(inline).run()
}
defineExpose({ insertMarkdown, insertInlineMarkdown })

// Reflect external changes (e.g. a draft finishing loading) without clobbering typing.
watch(model, (value) => {
  if (editor.value && value !== editor.value.getMarkdown()) {
    editor.value.commands.setContent(value, { contentType: 'markdown' })
  }
})
</script>

<template>
  <EditorContent :editor="editor" class="prose-editor" />
</template>
