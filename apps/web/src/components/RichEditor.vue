<script setup lang="ts">
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { Mark } from '@tiptap/pm/model'
import { TextSelection as CursorSelection } from '@tiptap/pm/state'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { DRAFT_SECTIONS, DRAFT_TOOLS, openLinkOnModClick } from '../lib/editor-tools'
import Icon from './Icon.vue'
import EditorToolbar from './EditorToolbar.vue'
import {
  CommentMarks,
  commentMarksKey,
  textBlocks,
  type CommentMarkPoint,
  type CommentMarkStorage,
} from '../lib/comment-marks'
import { COMMENT_QUOTE_MAX_LENGTH, countWords } from '@wordwright/core'
import { NOTE_DRAG_TYPE, ARTICLE_DRAG_TYPE } from '../lib/note-drag'
import type { TextSelection } from '../lib/text-selection'
import { scrollPageToTop } from '../lib/scroll'
import { trackKeyboardInset } from '../lib/keyboard-inset'

const model = defineModel<string>({ required: true })
/** Editing the Markdown itself in a plain text box, instead of the rich-text editor. */
const markdownMode = defineModel<boolean>('markdownMode', { default: false })
const props = defineProps<{
  /** The comments to mark in the text, beside the paragraphs they are about. */
  commentMarks?: CommentMarkPoint[]
  /** The point being looked at: its paragraph is marked more strongly. */
  activePointId?: string | null
  /** False for someone who may read the draft but not change it. */
  editable?: boolean
  /** Offer Comment and Rephrase in the toolbar. */
  actions?: boolean
  /** Words that can be rephrased are selected. */
  rephraseReady?: boolean
  /** For someone who can't edit but can comment (a member, a reviewer): a bar above the text with Add comment. */
  commentBar?: boolean
}>()
const emit = defineEmits<{
  /** The selection changed; null when nothing is selected. */
  selectionChange: [selection: TextSelection | null]
  /** A comment mark was pressed. */
  pointPick: [id: string]
  /** Which comments found their paragraph in the text as it is now. */
  located: [paragraphs: Record<string, string>]
  /** Comment was pressed in the toolbar. */
  comment: []
  /** Rephrase was pressed in the toolbar. */
  rephrase: []
  /** A note from the side bar was dropped on the text, at this position in it (unknown when it can't be worked out). */
  noteDrop: [noteId: string, position: number | undefined]
  /** An article from the side bar was dropped on the text: its link goes in at this position (as for a note). */
  articleDrop: [itemId: string, position: number | undefined]
}>()

/** The selection changed: the count of words and the page (through `selectionChange`) both hear. */
function emitSelection(selection: TextSelection | null) {
  selectedText.value = selection?.text ?? ''
  emit('selectionChange', selection)
}

/** What a drag from the side bar carries, if it is one of ours: which kind, and the id. */
function dragged(event: DragEvent): { type: 'note' | 'article'; id: string } | null {
  const types = event.dataTransfer?.types
  if (!types) return null
  for (const [type, kind] of [
    [NOTE_DRAG_TYPE, 'note'],
    [ARTICLE_DRAG_TYPE, 'article'],
  ] as const) {
    if (types.includes(type)) return { type: kind, id: event.dataTransfer!.getData(type) }
  }
  return null
}
const isOurs = (event: DragEvent) =>
  !!event.dataTransfer?.types.some((t) => t === NOTE_DRAG_TYPE || t === ARTICLE_DRAG_TYPE)
function hand(drag: { type: 'note' | 'article'; id: string }, position: number | undefined) {
  if (drag.type === 'note') emit('noteDrop', drag.id, position)
  else emit('articleDrop', drag.id, position)
}

/** Whether the writer has put the cursor in the text yet; until then insertions go at the end. */
let touched = false

/** The Markdown box is for editing; someone who may only read the draft always sees it formatted. */
const sourceMode = computed(() => markdownMode.value && props.editable !== false)
const source = useTemplateRef<HTMLTextAreaElement>('source')

const editor = useEditor({
  content: model.value,
  editable: props.editable !== false,
  contentType: 'markdown',
  extensions: [
    // A plain click puts the cursor in the link to edit it; Ctrl or Cmd with the click opens it (see handleClick).
    StarterKit.configure({
      link: { openOnClick: false },
      dropcursor: { color: 'var(--color-accent)', width: 2 }, // shows where a dragged note will land
    }),
    Markdown,
    CommentMarks.configure({
      points: () => props.commentMarks ?? [],
      activeId: () => props.activePointId ?? null,
      onPick: (id) => emit('pointPick', id),
      onLocated: (paragraphs) => emit('located', paragraphs),
    }),
    Placeholder.configure({ placeholder: 'Start writing…' }),
  ],
  editorProps: {
    attributes: { 'aria-label': 'Draft body', role: 'textbox', 'aria-multiline': 'true' },
    handleDOMEvents: {
      // Notes dragged from the side bar land where they are dropped. These are DOM-level handlers, ahead of
      // ProseMirror's own drop handling, which only calls its `handleDrop` once it has worked out a position.
      dragover: (_view, event) => {
        if (isOurs(event)) event.dataTransfer!.dropEffect = 'copy'
        return false // the drop cursor still follows the pointer
      },
      drop: (view, event) => {
        const drag = dragged(event)
        if (!drag?.id) return false // something else (a file, some text) is dropped: the editor's own business
        event.preventDefault()
        let position: number | undefined
        try {
          position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        } catch {
          position = undefined
        }
        hand(drag, position)
        return true
      },
      click: (_view, event) => openLinkOnModClick(event),
    },
  },
  onFocus: () => {
    touched = true
  },
  onUpdate: ({ editor }) => {
    model.value = editor.getMarkdown()
  },
  onSelectionUpdate: ({ editor }) => {
    const { from, to, empty, $from, $to } = editor.state.selection
    emitSelection(
      empty
        ? null
        : {
            from,
            to,
            text: editor.state.doc.textBetween(from, to, ' '),
            sameBlock: $from.sameParent($to) && $from.parent.isTextblock,
          },
    )
  },
})

/**
 * Replaces the text between two positions with plain words (a Rephrase window handing back what the writer chose),
 * leaving the cursor after them. Returns false if the editor isn't ready, or if what is there is no longer
 * `expected` (the draft was replaced from elsewhere while a window was open, so the positions mean something else).
 * The change reaches `model` like typing.
 */
function replaceRange(from: number, to: number, text: string, expected: string): boolean {
  const e = editor.value
  if (!e) return false
  const size = e.state.doc.content.size
  if (to > size || e.state.doc.textBetween(from, to, ' ') !== expected) return false
  // The marks are set outright: `insertContentAt` would give the words whatever the first character had.
  const found = marksInRange(from, to)
  const marks = found === 'mixed' ? [] : found
  return e
    .chain()
    .focus()
    .command(({ tr, state }) => {
      tr.replaceWith(from, to, state.schema.text(text, marks))
      tr.setSelection(CursorSelection.near(tr.doc.resolve(from + text.length))) // the cursor after them, nothing selected
      return true
    })
    .run()
}

/**
 * The formatting of the words between two positions: the marks they all share (an empty list for plain words), or
 * 'mixed' when some have formatting that others lack. Rephrase's words keep shared formatting but can't be fitted
 * to mixed, so the window says so before the writer uses them.
 */
function marksInRange(from: number, to: number): readonly Mark[] | 'mixed' {
  const e = editor.value
  if (!e) return []
  let shared: readonly Mark[] | null = null
  let mixed = false
  e.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText || mixed) return
    // Only the selected part of the node counts, and spaces beside formatted words don't, or selecting "a word "
    // would read as mixed.
    const inside = node.text!.slice(Math.max(from - pos, 0), to - pos)
    if (!inside.trim()) return
    if (shared === null) shared = node.marks
    else if (!Mark.sameSet(shared, node.marks)) mixed = true
  })
  return mixed ? 'mixed' : (shared ?? [])
}
/** Whether the words between two positions have mixed formatting (see `marksInRange`). */
function hasMixedFormatting(from: number, to: number): boolean {
  return !sourceMode.value && marksInRange(from, to) === 'mixed'
}

/**
 * Puts Markdown into the text as its own paragraph(s): at `at` if given (a drop), otherwise after the one the cursor
 * is in (or at the end, if the cursor has never been in the text). Returns false if the editor isn't ready. The change reaches `model` through
 * the editor's own update, like typing.
 */
function insertMarkdown(markdown: string, at?: number): boolean {
  if (sourceMode.value) return insertIntoSource(markdown)
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
/**
 * Puts Markdown (a link) into the line where the cursor is, without starting a new paragraph, or exactly at `at` if
 * given (a drop).
 */
function insertInlineMarkdown(markdown: string, at?: number): boolean {
  if (sourceMode.value) return insertIntoSource(markdown, true)
  const e = editor.value
  if (!e) return false
  if (at === undefined && !touched) e.commands.focus('end')
  // Parsed as a paragraph, of which only the inline content (the link and its text) goes into the current line.
  const inline = e.markdown?.parse(markdown).content?.[0]?.content
  if (!inline) return false
  if (at !== undefined) {
    const position = Math.min(Math.max(at, 0), e.state.doc.content.size)
    // Between paragraphs there is no line to put a link in, so it gets one of its own.
    const content = e.state.doc.resolve(position).parent.inlineContent
      ? inline
      : { type: 'paragraph', content: inline }
    return e.chain().focus().insertContentAt(position, content).run()
  }
  return e.chain().focus().insertContent(inline).run()
}
/** The paragraph (or heading...) a comment is about, if it is in the text now. */
function pointElement(id: string): HTMLElement | null {
  if (sourceMode.value) return null // comments are not shown in the Markdown box
  const e = editor.value
  const pos = (
    e?.storage as unknown as { commentMarks: CommentMarkStorage } | undefined
  )?.commentMarks.positions.get(id)
  if (!e || pos === undefined) return null
  const dom = e.view.nodeDOM(pos)
  return dom instanceof HTMLElement ? dom : null
}
/** Scrolls the page so the paragraph a comment is about is at the top. False if it is not in the text now. */
function scrollToPoint(id: string): boolean {
  const el = pointElement(id)
  if (el) scrollPageToTop(el)
  return !!el
}
/** Puts the cursor at that paragraph and scrolls it to the top. False if it is not in the text now. */
function focusPoint(id: string): boolean {
  const e = editor.value
  const el = pointElement(id)
  if (!e || !el) return false
  // The scrolling is ours (to the top), not the editor's own (which only brings the cursor into view).
  const pos = e.view.posAtDOM(el, 0)
  e.chain().focus(null, { scrollIntoView: false }).setTextSelection(pos).run()
  scrollPageToTop(el)
  return true
}

// ---- the Markdown box
/** Selection in the Markdown box, in the same shape the editor reports it (offsets in the text). */
function reportSourceSelection() {
  const box = source.value
  if (!box) return
  const { selectionStart: from, selectionEnd: to } = box
  if (from === to) return emitSelection(null)
  const text = box.value.slice(from, to)
  emitSelection({ from, to, text, sameBlock: !/\n\s*\n/.test(text) })
}
function placeSourceCaret(offset: number) {
  nextTick(() => {
    const box = source.value
    if (!box) return
    box.focus()
    box.setSelectionRange(offset, offset)
    emitSelection(null)
  })
}
/**
 * Puts Markdown into the box: after the paragraph the cursor is in (at the end if the cursor has never been in the
 * text) as its own paragraph(s), or, `inline`, right at the cursor (a link in the line being written).
 */
function insertIntoSource(markdown: string, inline = false): boolean {
  const box = source.value
  if (!box) return false
  const text = model.value
  const caret = touched ? box.selectionEnd : text.length
  if (inline) {
    model.value = text.slice(0, caret) + markdown + text.slice(caret)
    placeSourceCaret(caret + markdown.length)
    return true
  }
  const gap = text.indexOf('\n\n', caret)
  const end = gap === -1 ? text.length : gap
  const before = text.slice(0, end).replace(/\s+$/, '')
  const after = text.slice(end).replace(/^\s+/, '')
  const added = markdown.trim()
  model.value = [before, added, after].filter(Boolean).join('\n\n')
  placeSourceCaret((before ? before.length + 2 : 0) + added.length)
  return true
}
function onSourceDragover(event: DragEvent) {
  if (!isOurs(event)) return
  event.preventDefault() // a text box refuses what it does not know unless told otherwise
  event.dataTransfer!.dropEffect = 'copy'
}
function onSourceDrop(event: DragEvent) {
  const drag = dragged(event)
  if (!drag?.id) return // something else: the box's own business
  event.preventDefault()
  // A text box cannot say where in its text a drop landed, so it goes where the cursor is.
  hand(drag, undefined)
}

// Switching between the editor and the box: the box is plain text, so what is selected, and where, no longer applies.
watch(sourceMode, (on) => {
  emitSelection(null)
  if (on) {
    nextTick(() => source.value?.focus())
  } else {
    // What was typed in the box goes into the editor, without counting as an edit of its own.
    editor.value?.commands.setContent(model.value, { contentType: 'markdown', emitUpdate: false })
    nextTick(() => editor.value?.commands.focus())
  }
})

/**
 * What a comment made now would be about: the paragraph holding the caret or the start of the selection (counted among
 * the paragraphs that hold text, as the comment marks count them) and, if the selection is words within that one
 * paragraph, the words. Null when the caret has not been in the text, or in the Markdown box.
 */
function commentTarget(): { index: number; text: string; quote: string | null } | null {
  const e = editor.value
  if (sourceMode.value || !e) return null
  const { from, to, empty, $from, $to } = e.state.selection
  if (!touched && empty) return null
  const blocks = textBlocks(e.state.doc)
  const start = $from.parent.isTextblock ? $from.before() : -1
  const index = blocks.findIndex((b) => b.pos === start)
  if (index === -1) return null
  const quote = empty || !$from.sameParent($to) ? '' : e.state.doc.textBetween(from, to, ' ').trim()
  return {
    index,
    text: blocks[index]!.text,
    quote: quote && quote.length <= COMMENT_QUOTE_MAX_LENGTH ? quote : null,
  }
}

// ---- the word count, for the body only; with words selected it is "N of M words"
const selectedText = ref('')
const wordCountText = computed(() => {
  const e = editor.value
  const markdown = model.value // read so that every change to the text recounts
  const plain = sourceMode.value || !e ? markdown : e.getText({ blockSeparator: '\n' })
  // In the Markdown box the marks (`##`, `-`, `**`) are not words, so only pieces with a letter or digit count.
  const count = (text: string) =>
    sourceMode.value
      ? text.split(/\s+/).filter((piece) => /[\p{L}\p{N}]/u.test(piece)).length
      : countWords(text)
  const total = count(plain)
  const chosen = selectedText.value ? count(selectedText.value) : 0
  const words = (n: number) => `${n} ${n === 1 ? 'word' : 'words'}`
  return chosen ? `${chosen} of ${words(total)}` : words(total)
})

/** Puts the caret at the start of the words, for Return in the title. */
function focusStart() {
  if (sourceMode.value) source.value?.focus()
  else editor.value?.commands.focus('start')
}

// ---- the toolbar pinned to the bottom of a phone's screen (#380)
const root = useTemplateRef<HTMLElement>('root')
const dock = useTemplateRef<HTMLElement>('dock')
let stopKeyboard: (() => void) | undefined
// Made here, in setup, so that it is the toolbar's observer (made when the toolbar is set up, after this) that is last.
const dockObserver =
  typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(reserveDock)
/** Room under the text for the pinned bar (so the last line can scroll clear of it), and for the caret to scroll to. */
function reserveDock() {
  const el = dock.value
  const pinned = !!el && getComputedStyle(el).position === 'fixed'
  const height = pinned ? el.offsetHeight : 0
  root.value?.style.setProperty('--dock-height', `${height}px`)
  const view = editor.value?.view
  if (view && !view.isDestroyed) {
    view.setProps({ scrollMargin: { top: 0, right: 0, bottom: height + 8, left: 0 } })
  }
}
onMounted(() => {
  stopKeyboard = trackKeyboardInset()
  watch(
    dock,
    (el) => {
      dockObserver?.disconnect()
      if (el) dockObserver?.observe(el)
      reserveDock()
    },
    { immediate: true },
  )
})
onBeforeUnmount(() => {
  stopKeyboard?.()
  dockObserver?.disconnect()
})

defineExpose({
  focusStart,
  commentTarget,
  insertMarkdown,
  insertInlineMarkdown,
  replaceRange,
  hasMixedFormatting,
  focusPoint,
  scrollToPoint,
})

// The marks are redrawn when the points or the one being looked at change, not only when the text does.
watch(
  () => [props.commentMarks, props.activePointId],
  () => {
    const e = editor.value
    if (e) e.view.dispatch(e.state.tr.setMeta(commentMarksKey, 'refresh'))
  },
  { deep: true },
)

watch(
  () => props.editable !== false,
  (editable) => editor.value?.setEditable(editable),
)

// Reflect external changes (e.g. a draft finishing loading) without clobbering typing.
watch(model, (value) => {
  if (sourceMode.value) return // the box owns the text; the editor catches up when it is shown again
  if (editor.value && value !== editor.value.getMarkdown()) {
    editor.value.commands.setContent(value, { contentType: 'markdown' })
  }
})
</script>

<template>
  <div ref="root" class="phone:pb-(--dock-height,0px)">
    <!-- Sticky, so formatting stays in reach in a long draft. On a phone the toolbar is pinned to the bottom of the
         screen, above the keyboard (the `dock`), and only the status line is left to stick at the top. -->
    <div
      v-if="editable !== false"
      class="sticky top-(--bar-top,0px) z-10 mb-3 border-b border-line bg-paper py-1 phone:contents"
    >
      <!-- Above the buttons: the save state (the page's, in the slot) and how long the text is. -->
      <div
        class="mb-1 flex items-baseline justify-between gap-3 text-sm text-ink-soft phone:sticky phone:top-(--bar-top,0px) phone:z-10 phone:mb-3 phone:border-b phone:border-line phone:bg-paper phone:py-1"
      >
        <div class="min-h-5"><slot name="status" /></div>
        <p data-testid="word-count">{{ wordCountText }}</p>
      </div>
      <div
        ref="dock"
        class="phone:fixed phone:inset-x-0 phone:bottom-(--keyboard-inset,0px) phone:z-20 phone:flex phone:flex-col-reverse phone:border-t phone:border-line phone:bg-paper phone:px-4 phone:py-1"
      >
        <EditorToolbar
          v-model:markdown-mode="markdownMode"
          :editor="editor"
          :tools="DRAFT_TOOLS"
          :sections="DRAFT_SECTIONS"
          markdown-toggle
          :actions="actions"
          :rephrase-ready="rephraseReady"
          @comment="emit('comment')"
          @rephrase="emit('rephrase')"
        />
        <!-- The reason a button did nothing, and what the two do. -->
        <slot name="toolbar-notes" />
      </div>
    </div>
    <div
      v-if="commentBar"
      class="sticky top-(--bar-top,0px) z-10 mb-3 flex justify-end border-b border-line bg-paper py-1 phone:contents"
    >
      <div
        ref="dock"
        class="flex justify-end phone:fixed phone:inset-x-0 phone:bottom-(--keyboard-inset,0px) phone:z-20 phone:border-t phone:border-line phone:bg-paper phone:px-4 phone:py-1"
      >
        <button type="button" class="btn btn-outline btn-sm" @click="emit('comment')">
          <Icon name="comment" />
          Add comment
        </button>
      </div>
    </div>
    <EditorContent v-show="!sourceMode" :editor="editor" class="prose-editor" />
    <textarea
      v-if="sourceMode"
      ref="source"
      v-model="model"
      class="field markdown-source"
      aria-label="Draft body, as Markdown"
      spellcheck="true"
      @focus="touched = true"
      @select="reportSourceSelection"
      @keyup="reportSourceSelection"
      @mouseup="reportSourceSelection"
      @input="reportSourceSelection"
      @dragover="onSourceDragover"
      @drop="onSourceDrop"
    ></textarea>
  </div>
</template>
