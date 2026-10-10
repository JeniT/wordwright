<script setup lang="ts">
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { watch } from 'vue'

const model = defineModel<string>({ required: true })

/** Whether the writer has put the cursor in the text yet; until then insertions go at the end. */
let touched = false

const editor = useEditor({
  content: model.value,
  contentType: 'markdown',
  extensions: [StarterKit, Markdown, Placeholder.configure({ placeholder: 'Start writing…' })],
  editorProps: {
    attributes: { 'aria-label': 'Draft body', role: 'textbox', 'aria-multiline': 'true' },
  },
  onFocus: () => {
    touched = true
  },
  onUpdate: ({ editor }) => {
    model.value = editor.getMarkdown()
  },
})

/**
 * Puts Markdown into the text as its own paragraph(s) after the one the cursor is in (or at the end, if the
 * cursor has never been in the text). Returns false if the editor isn't ready. The change reaches `model` through
 * the editor's own update, like typing.
 */
function insertMarkdown(markdown: string): boolean {
  const e = editor.value
  if (!e) return false
  if (!touched) e.commands.focus('end')
  const { $to } = e.state.selection
  // Inside a paragraph that has words, go after it rather than splitting it; an empty one is filled in place.
  const at = $to.parent.textContent.length ? $to.after() : $to.pos
  return e.chain().focus().insertContentAt(at, markdown, { contentType: 'markdown' }).run()
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
