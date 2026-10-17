<script setup lang="ts">
import { PUBLICATION_DESCRIPTION_MAX } from '@wordwright/core'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { computed, useId, watch } from 'vue'
import { DESCRIPTION_TOOLS } from '../lib/editor-tools'
import EditorToolbar from './EditorToolbar.vue'

/**
 * Where a publication description is written: a small rich-text editor, so nobody needs to know Markdown. It offers what
 * the description can show (bold, italic, links, bulleted and numbered lists, paragraphs) and reads and writes
 * Markdown, which is how the description is stored and rendered everywhere else. The toolbar is the shared
 * `EditorToolbar` (icon buttons, each named, one tab stop); the usual shortcuts (Ctrl or Cmd with B and I) work in the
 * text. Anything else pasted in (headings, pictures, tables) is flattened to paragraphs.
 */
const model = defineModel<string>({ required: true })
const props = withDefaults(
  defineProps<{
    label: string
    hint?: string
    placeholder?: string
    maxlength?: number
  }>(),
  {
    hint: undefined,
    placeholder: '',
    maxlength: PUBLICATION_DESCRIPTION_MAX,
  },
)

const labelId = useId()
const hintId = useId()

const editor = useEditor({
  content: model.value,
  contentType: 'markdown',
  extensions: [
    StarterKit.configure({
      // Only what a description can show. Underline would be saved as HTML, which the page does not render.
      heading: false,
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
      // No empty paragraph kept after a list: it would end the saved text with blank lines and make "select all, make it
      // a list" report that the whole selection is not one.
      trailingNode: false,
      underline: false,
      // A plain click puts the cursor in a link to edit it; Ctrl or Cmd with the click opens it.
      link: { openOnClick: false },
    }),
    Markdown,
    Placeholder.configure({ placeholder: () => props.placeholder }),
  ],
  editorProps: {
    attributes: {
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-labelledby': labelId,
      ...(props.hint ? { 'aria-describedby': hintId } : {}),
      class: 'markdown description-editor',
    },
    handleDOMEvents: {
      click: (_view, event) => {
        const link = (event.target as HTMLElement).closest('a')
        if (!link || !(event.ctrlKey || event.metaKey)) return false
        event.preventDefault()
        window.open(link.href, '_blank', 'noopener')
        return true
      },
    },
  },
  onUpdate: ({ editor }) => {
    model.value = editor.getMarkdown()
  },
})

// Words that arrive from outside (an AI draft, a saved description loading) go into the editor without being
// written back, so a description nobody has touched is saved exactly as it was.
watch(model, (value) => {
  if (editor.value && value !== editor.value.getMarkdown()) {
    editor.value.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
  }
})

const over = computed(() => model.value.length - props.maxlength)
defineExpose({ editor })
</script>

<template>
  <div class="mb-4">
    <span :id="labelId" class="mb-1 block text-sm font-medium">{{ label }}</span>

    <EditorToolbar :editor="editor" :tools="DESCRIPTION_TOOLS" />

    <EditorContent :editor="editor" class="field description-field" />
    <p v-if="hint" :id="hintId" class="mt-1 text-sm text-ink-soft">{{ hint }}</p>
    <p v-if="over > 0" role="alert" class="mt-1 text-sm text-danger">
      This is {{ over }} {{ over === 1 ? 'character' : 'characters' }} over the limit of
      {{ maxlength }}. Shorten it to save it.
    </p>
  </div>
</template>
