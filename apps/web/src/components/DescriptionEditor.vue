<script setup lang="ts">
import { PUBLICATION_DESCRIPTION_MAX } from '@lfwa/core'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'

/**
 * Where a publication description is written: a small rich-text editor, so nobody needs to know Markdown. It offers what
 * the description can show (bold, italic, links, bulleted and numbered lists, paragraphs) and reads and writes
 * Markdown, which is how the description is stored and rendered everywhere else. The toolbar is made of ordinary
 * buttons with words on them, so it works by keyboard and is read out; the usual shortcuts (Ctrl or Cmd with B, I and
 * K) work in the text. Anything else pasted in (headings, pictures, tables) is flattened to paragraphs.
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
    placeholder: 'Write a few sentences…',
    maxlength: PUBLICATION_DESCRIPTION_MAX,
  },
)

const labelId = useId()
const hintId = useId()
const linkInputId = useId()
const linkInput = useTemplateRef<HTMLInputElement>('linkInput')
const linkButton = useTemplateRef<HTMLButtonElement>('linkButton')

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

const is = (name: string) => !!editor.value?.isActive(name)
const run = (action: (chain: ReturnType<NonNullable<typeof editor.value>['chain']>) => unknown) => {
  const e = editor.value
  if (e) (action(e.chain().focus()) as { run: () => boolean }).run()
}

// ---- links
const linking = ref(false)
const address = ref('')
const addressError = ref('')

function openLink() {
  address.value = (editor.value?.getAttributes('link').href as string | undefined) ?? ''
  addressError.value = ''
  linking.value = true
  nextTick(() => linkInput.value?.focus())
}
function closeLink() {
  linking.value = false
  nextTick(() => linkButton.value?.focus())
}
/** `example.com` is taken to mean https://example.com; only web and email addresses are kept. */
function tidyAddress(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  return /^(https?:|mailto:)/i.test(withScheme) && !/\s/.test(withScheme) ? withScheme : null
}
function applyLink() {
  const href = tidyAddress(address.value)
  if (!href) {
    addressError.value = 'Enter a web address, like https://example.com'
    return
  }
  const e = editor.value
  if (!e) return
  // With words selected (or the cursor in a link) they become the link; with neither, the address is the text.
  if (e.state.selection.empty && !e.isActive('link')) {
    e.chain()
      .focus()
      .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
      .run()
  } else {
    e.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }
  closeLink()
}
function removeLink() {
  editor.value?.chain().focus().extendMarkRange('link').unsetLink().run()
  closeLink()
}

const over = computed(() => model.value.length - props.maxlength)
// The toolbar's buttons say which formatting is on at the cursor.
defineExpose({ editor })
</script>

<template>
  <div class="mb-4">
    <span :id="labelId" class="mb-1 block text-sm font-medium">{{ label }}</span>

    <div role="toolbar" aria-label="Formatting" class="mb-1 flex flex-wrap items-center gap-1">
      <button
        type="button"
        class="btn btn-sm btn-quiet font-bold"
        :class="{ 'bg-accent-wash': is('bold') }"
        :aria-pressed="is('bold')"
        @click="run((c) => c.toggleBold())"
      >
        Bold
      </button>
      <button
        type="button"
        class="btn btn-sm btn-quiet italic"
        :class="{ 'bg-accent-wash': is('italic') }"
        :aria-pressed="is('italic')"
        @click="run((c) => c.toggleItalic())"
      >
        Italic
      </button>
      <button
        type="button"
        class="btn btn-sm btn-quiet"
        :class="{ 'bg-accent-wash': is('bulletList') }"
        :aria-pressed="is('bulletList')"
        @click="run((c) => c.toggleBulletList())"
      >
        Bulleted list
      </button>
      <button
        type="button"
        class="btn btn-sm btn-quiet"
        :class="{ 'bg-accent-wash': is('orderedList') }"
        :aria-pressed="is('orderedList')"
        @click="run((c) => c.toggleOrderedList())"
      >
        Numbered list
      </button>
      <button
        ref="linkButton"
        type="button"
        class="btn btn-sm btn-quiet"
        :class="{ 'bg-accent-wash': is('link') }"
        :aria-pressed="is('link')"
        :aria-expanded="linking"
        @click="linking ? closeLink() : openLink()"
      >
        Link
      </button>
    </div>

    <form
      v-if="linking"
      class="panel mb-2 flex flex-wrap items-end gap-2 p-3"
      @submit.prevent="applyLink"
      @keydown.esc.prevent="closeLink"
    >
      <div class="min-w-[14rem] flex-1">
        <label :for="linkInputId" class="mb-1 block text-sm font-medium">Link address</label>
        <input
          :id="linkInputId"
          ref="linkInput"
          v-model="address"
          class="field"
          autocomplete="off"
          autocapitalize="none"
          :spellcheck="false"
          :aria-invalid="!!addressError"
          :aria-describedby="addressError ? `${linkInputId}-error` : undefined"
          @input="addressError = ''"
        />
      </div>
      <button type="submit" class="btn btn-sm btn-primary">Add link</button>
      <button v-if="is('link')" type="button" class="btn btn-sm btn-outline" @click="removeLink">
        Remove link
      </button>
      <button type="button" class="btn btn-sm btn-quiet" @click="closeLink">Cancel</button>
      <p
        v-if="addressError"
        :id="`${linkInputId}-error`"
        role="alert"
        class="basis-full text-sm text-danger"
      >
        {{ addressError }}
      </p>
    </form>

    <EditorContent :editor="editor" class="field description-field" />
    <p v-if="hint" :id="hintId" class="mt-1 text-sm text-ink-soft">{{ hint }}</p>
    <p v-if="over > 0" role="alert" class="mt-1 text-sm text-danger">
      This is {{ over }} {{ over === 1 ? 'character' : 'characters' }} over the limit of
      {{ maxlength }}. Shorten it to save it.
    </p>
  </div>
</template>
