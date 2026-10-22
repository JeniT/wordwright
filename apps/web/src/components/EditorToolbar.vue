<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  useTemplateRef,
  watchEffect,
} from 'vue'
import { TOOLS, toolTitle, type Tool, type ToolName } from '../lib/editor-tools'
import LinkDialog from './LinkDialog.vue'
import ToolButton from './ToolButton.vue'

/**
 * The formatting buttons above an editor, shared by the draft and the description. Each editor says which tools it
 * offers; the buttons are icon-only (each named, with a tooltip that gives its shortcut) and say what is on at the
 * cursor with `aria-pressed`. The bar is a single tab stop; the arrow keys move along it. Buttons that do not fit
 * the width move into a More menu rather than wrapping or scrolling. The draft also offers a switch to Markdown
 * (`markdownToggle`), which hides the formatting buttons because they act on the rich-text editor. Comment, Rephrase
 * and the toggle sit together on the right and are never in the More menu. Ctrl or ⌘ and K opens the link dialog
 * from the text.
 */
const props = defineProps<{
  editor: Editor | undefined
  tools: ToolName[]
  /** Tools that end a section: a divider follows each (unless the bar has nothing after it). */
  dividers?: ToolName[]
  /** Offer the "Edit as Markdown" button. */
  markdownToggle?: boolean
  /** Offer the Comment and Rephrase buttons, apart from the formatting, on the right. */
  actions?: boolean
  /** Words that can be rephrased are selected; until then Rephrase says why not when pressed. */
  rephraseReady?: boolean
}>()
const emit = defineEmits<{ comment: []; rephrase: [] }>()
const markdownMode = defineModel<boolean>('markdownMode', { default: false })

const SLOT = 38 // a button (2.25rem) and the gap after it, in pixels
const DIVIDER = 13 // a divider (1px) with its margins and the gaps beside it
const barId = useId()
const bar = useTemplateRef<HTMLElement>('bar')

// ---- which buttons fit
const fitting = ref<number | null>(null) // null until the width is known: then everything shows
const shown = computed(() => props.tools.slice(0, fitting.value ?? props.tools.length))
const hidden = computed(() => props.tools.slice(fitting.value ?? props.tools.length))

function measure() {
  const width = bar.value?.clientWidth ?? 0
  if (!width) return // not laid out (or not in a browser): show everything
  const right = (props.markdownToggle ? SLOT : 0) + (props.actions ? 2 * SLOT : 0)
  const all = props.tools.length
  const dividers = props.dividers?.length ?? 0
  fitting.value =
    all * SLOT + dividers * DIVIDER + right <= width
      ? null
      : Math.max(1, Math.floor((width - right - SLOT - 12 - dividers * DIVIDER) / SLOT))
}
let observer: ResizeObserver | undefined
onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !bar.value) return
  observer = new ResizeObserver(measure)
  observer.observe(bar.value)
  measure()
})
onBeforeUnmount(() => observer?.disconnect())

/** Consecutive tools of one group sit together; the text styles are announced as a group. */
function chunks(names: ToolName[]): { group?: string; names: ToolName[] }[] {
  const out: { group?: string; names: ToolName[] }[] = []
  for (const name of names) {
    const group = TOOLS[name].group
    const last = out.at(-1)
    if (last && group && last.group === group) last.names.push(name)
    else out.push({ group, names: [name] })
  }
  return out
}

/** Whether a divider follows this tool: it ends a section and something is shown after it. */
const dividerAfter = (name: ToolName) =>
  !!props.dividers?.includes(name) && shown.value.indexOf(name) < shown.value.length - 1

const DIVIDER_CLASS = 'mx-1 h-5 w-px shrink-0 bg-line-strong'

const active = (tool: Tool) => !!props.editor && tool.isActive(props.editor)
/** What a tool's button shows: the same wherever it sits (the bar, a group or the More menu). */
const toolProps = (name: ToolName) => ({
  label: TOOLS[name].label,
  title: toolTitle(TOOLS[name]),
  icon: TOOLS[name].icon,
  pressed: active(TOOLS[name]),
  momentary: !!TOOLS[name].isDisabled,
  disabled: !!props.editor && !!TOOLS[name].isDisabled?.(props.editor),
  popup: name === 'link' ? ('dialog' as const) : undefined,
})

// ---- the one tab stop
const roving = ref('')
const order = computed(() => [
  // In Markdown mode the formatting buttons are not there, so the toggle is the bar's tab stop.
  // (A button that is off cannot take focus, so the arrows pass it by.)
  ...(markdownMode.value
    ? []
    : [
        ...shown.value.filter((name) => !toolProps(name).disabled),
        ...(hidden.value.length ? ['more'] : []),
      ]),
  ...(props.actions ? ['comment', 'rephrase'] : []),
  ...(props.markdownToggle ? ['markdown'] : []),
])
const tabStop = computed(() => (order.value.includes(roving.value) ? roving.value : order.value[0]))
const tabindexOf = (key: string) => (tabStop.value === key ? 0 : -1)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && moreOpen.value) {
    event.stopPropagation()
    closeMore(true)
    return
  }
  const key = (event.target as HTMLElement).dataset.roving
  if (!key || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
  const at = order.value.indexOf(key)
  const last = order.value.length - 1
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? last
        : event.key === 'ArrowRight'
          ? Math.min(at + 1, last)
          : Math.max(at - 1, 0)
  event.preventDefault()
  bar.value?.querySelector<HTMLElement>(`[data-roving="${order.value[next]}"]`)?.focus()
}
const rovingProps = (key: string) => ({
  'data-roving': key,
  tabindex: tabindexOf(key),
  onFocus: () => (roving.value = key),
})

// ---- the More menu
const moreOpen = ref(false)
function toggleMore() {
  moreOpen.value = !moreOpen.value
  // Into the menu, so the keyboard follows what it opened.
  if (moreOpen.value)
    nextTick(() =>
      bar.value
        ?.querySelector<HTMLElement>('[role="group"][aria-label="More formatting"] button')
        ?.focus(),
    )
}
function closeMore(refocus: boolean) {
  moreOpen.value = false
  if (refocus)
    nextTick(() => bar.value?.querySelector<HTMLElement>('[data-roving="more"]')?.focus())
}
function onDocumentPointer(event: Event) {
  if (moreOpen.value && !bar.value?.contains(event.target as Node)) closeMore(false)
}
onMounted(() => document.addEventListener('pointerdown', onDocumentPointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointer))

// ---- running a tool
function press(name: ToolName) {
  closeMore(false)
  if (name === 'link') return openLink()
  const e = props.editor
  const run = TOOLS[name].run
  if (e && run) run(e.chain().focus()).run()
}

// ---- links
const linking = ref(false)
const address = ref('')
function openLink() {
  address.value = (props.editor?.getAttributes('link').href as string | undefined) ?? ''
  linking.value = true
}
function closeLink() {
  linking.value = false
  // The button that opened the dialog may have been in the More menu, which has closed: keep the writer in the text.
  nextTick(() => {
    if (document.activeElement === document.body) props.editor?.commands.focus()
  })
}
// Ctrl or ⌘ and K, from the text. (In the Markdown box there is no link dialog to open.)
watchEffect((onCleanup) => {
  const e = props.editor
  if (!e || e.isDestroyed || !props.tools.includes('link')) return
  const dom = e.view.dom
  const onKey = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== 'k' || !(event.ctrlKey || event.metaKey)) return
    if (event.shiftKey || event.altKey) return
    event.preventDefault() // the browser's own use of it (the address bar's search)
    openLink()
  }
  dom.addEventListener('keydown', onKey)
  onCleanup(() => dom.removeEventListener('keydown', onKey))
})
function applyLink(href: string) {
  const e = props.editor
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
  // As the toolbar button does: just the selected words if some are selected, else the whole link.
  props.editor?.chain().focus().unsetLink().run()
  closeLink()
}
</script>

<template>
  <div class="mb-1">
    <div
      ref="bar"
      role="toolbar"
      aria-label="Formatting"
      class="relative flex items-center gap-1 overflow-x-clip"
      @keydown="onKeydown"
    >
      <template v-if="!markdownMode">
        <template v-for="(chunk, i) in chunks(shown)" :key="i">
          <span v-if="chunk.group" role="group" :aria-label="chunk.group" class="flex gap-1">
            <template v-for="name in chunk.names" :key="name">
              <ToolButton
                v-bind="{ ...toolProps(name), ...rovingProps(name) }"
                @press="press(name)"
              />
              <span v-if="dividerAfter(name)" :class="DIVIDER_CLASS" role="separator"></span>
            </template>
          </span>
          <template v-else>
            <template v-for="name in chunk.names" :key="name">
              <ToolButton
                v-bind="{ ...toolProps(name), ...rovingProps(name) }"
                @press="press(name)"
              />
              <span v-if="dividerAfter(name)" :class="DIVIDER_CLASS" role="separator"></span>
            </template>
          </template>
        </template>

        <template v-if="hidden.length">
          <ToolButton
            label="More formatting"
            title="More formatting"
            icon="more"
            :pressed="false"
            popup="true"
            :expanded="moreOpen"
            :aria-controls="`${barId}-more`"
            v-bind="rovingProps('more')"
            @press="toggleMore"
          />
          <div
            v-if="moreOpen"
            :id="`${barId}-more`"
            role="group"
            aria-label="More formatting"
            class="panel absolute top-full right-0 z-20 mt-1 flex max-w-full flex-wrap gap-1 p-1"
          >
            <ToolButton
              v-for="name in hidden"
              :key="name"
              v-bind="toolProps(name)"
              @press="press(name)"
            />
          </div>
        </template>
      </template>

      <!-- Never in the More menu: Comment and Rephrase are what the writer does with words they have selected. -->
      <div v-if="actions || markdownToggle" class="ml-auto flex gap-1">
        <span v-if="actions" role="group" aria-label="Comment and rephrase" class="flex gap-1">
          <ToolButton
            label="Comment"
            title="Comment on the selected words"
            icon="comment"
            :pressed="false"
            momentary
            :unavailable="markdownMode"
            v-bind="rovingProps('comment')"
            @press="emit('comment')"
          />
          <ToolButton
            label="Rephrase"
            title="Rephrase the selected words"
            icon="ai"
            :pressed="false"
            momentary
            :unavailable="markdownMode || !rephraseReady"
            v-bind="rovingProps('rephrase')"
            @press="emit('rephrase')"
          />
        </span>
        <ToolButton
          v-if="markdownToggle"
          label="Edit as Markdown"
          title="Edit as Markdown"
          icon="markdown"
          :pressed="markdownMode"
          v-bind="rovingProps('markdown')"
          @press="markdownMode = !markdownMode"
        />
      </div>
    </div>

    <LinkDialog
      :open="linking"
      :address="address"
      @apply="applyLink"
      @remove="removeLink"
      @cancel="closeLink"
    />
  </div>
</template>
