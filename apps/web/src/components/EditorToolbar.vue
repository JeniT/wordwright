<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, useTemplateRef } from 'vue'
import { TOOLS, toolTitle, type Tool, type ToolName } from '../lib/editor-tools'
import LinkDialog from './LinkDialog.vue'
import ToolButton from './ToolButton.vue'

/**
 * The formatting buttons above an editor, shared by the draft and the description. Each editor says which tools it
 * offers; the buttons are icon-only (each named, with a tooltip that gives its shortcut) and say what is on at the
 * cursor with `aria-pressed`. The bar is a single tab stop; the arrow keys move along it. Buttons that do not fit
 * the width move into a More menu rather than wrapping or scrolling. The draft also offers a switch to Markdown
 * (`markdownToggle`), which hides the formatting buttons because they act on the rich-text editor.
 */
const props = defineProps<{
  editor: Editor | undefined
  tools: ToolName[]
  /** Offer the "Edit as Markdown" button. */
  markdownToggle?: boolean
}>()
const markdownMode = defineModel<boolean>('markdownMode', { default: false })

const SLOT = 38 // a button (2.25rem) and the gap after it, in pixels
const barId = useId()
const bar = useTemplateRef<HTMLElement>('bar')

// ---- which buttons fit
const fitting = ref<number | null>(null) // null until the width is known: then everything shows
const shown = computed(() => props.tools.slice(0, fitting.value ?? props.tools.length))
const hidden = computed(() => props.tools.slice(fitting.value ?? props.tools.length))

function measure() {
  const width = bar.value?.clientWidth ?? 0
  if (!width) return // not laid out (or not in a browser): show everything
  const toggle = props.markdownToggle ? SLOT : 0
  const grouped = props.tools.some((name) => TOOLS[name].group) ? 8 : 0 // a group's border and padding
  const all = props.tools.length
  fitting.value =
    all * SLOT + toggle + grouped <= width
      ? null
      : Math.max(1, Math.floor((width - toggle - grouped - SLOT - 12) / SLOT))
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

const active = (tool: Tool) => !!props.editor && tool.isActive(props.editor)
/** What a tool's button shows: the same wherever it sits (the bar, a group or the More menu). */
const toolProps = (name: ToolName) => ({
  label: TOOLS[name].label,
  title: toolTitle(TOOLS[name]),
  icon: TOOLS[name].icon,
  pressed: active(TOOLS[name]),
  popup: name === 'link' ? ('dialog' as const) : undefined,
})

// ---- the one tab stop
const roving = ref('')
const order = computed(() => [
  // In Markdown mode the formatting buttons are not there, so the toggle is the bar's tab stop.
  ...(markdownMode.value ? [] : [...shown.value, ...(hidden.value.length ? ['more'] : [])]),
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
  props.editor?.chain().focus().extendMarkRange('link').unsetLink().run()
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
          <span
            v-if="chunk.group"
            role="group"
            :aria-label="chunk.group"
            class="flex gap-0.5 rounded-ctl border border-line p-0.5"
          >
            <ToolButton
              v-for="name in chunk.names"
              :key="name"
              v-bind="{ ...toolProps(name), ...rovingProps(name) }"
              @press="press(name)"
            />
          </span>
          <template v-else>
            <ToolButton
              v-for="name in chunk.names"
              :key="name"
              v-bind="{ ...toolProps(name), ...rovingProps(name) }"
              @press="press(name)"
            />
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

      <ToolButton
        v-if="markdownToggle"
        class="ml-auto"
        label="Edit as Markdown"
        title="Edit as Markdown"
        icon="markdown"
        :pressed="markdownMode"
        v-bind="rovingProps('markdown')"
        @press="markdownMode = !markdownMode"
      />
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
