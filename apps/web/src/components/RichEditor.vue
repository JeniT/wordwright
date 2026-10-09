<script setup lang="ts">
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { watch } from 'vue'

const model = defineModel<string>({ required: true })

const editor = useEditor({
  content: model.value,
  contentType: 'markdown',
  extensions: [StarterKit, Markdown, Placeholder.configure({ placeholder: 'Start writing…' })],
  editorProps: {
    attributes: { 'aria-label': 'Draft body', role: 'textbox', 'aria-multiline': 'true' },
  },
  onUpdate: ({ editor }) => {
    model.value = editor.getMarkdown()
  },
})

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
