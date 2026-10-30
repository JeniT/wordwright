import type { Editor } from '@tiptap/vue-3'
import type Icon from '../components/Icon.vue'

type IconName = InstanceType<typeof Icon>['$props']['name']
type Chain = ReturnType<Editor['chain']>

export type ToolName =
  | 'paragraph'
  | 'heading2'
  | 'heading3'
  | 'bold'
  | 'italic'
  | 'code'
  | 'quote'
  | 'bulletList'
  | 'orderedList'
  | 'codeBlock'
  | 'link'
  | 'unlink'

export interface Tool {
  label: string
  icon: IconName
  /** What the tooltip adds after the name; `Mod` stands for Ctrl or ⌘. */
  shortcut?: string
  isActive: (editor: Editor) => boolean
  /** An action, not a state: it is never "pressed", and is off when it would do nothing. */
  isDisabled?: (editor: Editor) => boolean
  /** Not set for the link, which asks for an address first (see EditorToolbar). */
  run?: (chain: Chain) => Chain
}

/** Whether any of the selection, or the cursor, is in a link. */
function inLink(editor: Editor): boolean {
  const { from, to, empty } = editor.state.selection
  const link = editor.schema.marks.link
  if (!link) return false
  return empty ? editor.isActive('link') : editor.state.doc.rangeHasMark(from, to, link)
}

/** Every button the editors' toolbars can show. Which ones an editor shows is its own choice (see EditorToolbar). */
export const TOOLS: Record<ToolName, Tool> = {
  paragraph: {
    label: 'Paragraph',
    icon: 'paragraph',
    shortcut: 'Mod+Alt+0',
    isActive: (e) =>
      e.isActive('paragraph') && !e.isActive('listItem') && !e.isActive('blockquote'),
    run: (c) => c.setParagraph(),
  },
  heading2: {
    label: 'Heading 2',
    icon: 'heading-2',
    shortcut: 'Mod+Alt+2',
    isActive: (e) => e.isActive('heading', { level: 2 }),
    run: (c) => c.toggleHeading({ level: 2 }),
  },
  heading3: {
    label: 'Heading 3',
    icon: 'heading-3',
    shortcut: 'Mod+Alt+3',
    isActive: (e) => e.isActive('heading', { level: 3 }),
    run: (c) => c.toggleHeading({ level: 3 }),
  },
  bold: {
    label: 'Bold',
    icon: 'bold',
    shortcut: 'Mod+B',
    isActive: (e) => e.isActive('bold'),
    run: (c) => c.toggleBold(),
  },
  italic: {
    label: 'Italic',
    icon: 'italic',
    shortcut: 'Mod+I',
    isActive: (e) => e.isActive('italic'),
    run: (c) => c.toggleItalic(),
  },
  code: {
    label: 'Inline code',
    icon: 'code',
    shortcut: 'Mod+E',
    isActive: (e) => e.isActive('code'),
    run: (c) => c.toggleCode(),
  },
  quote: {
    label: 'Quote',
    icon: 'quote',
    shortcut: 'Mod+Shift+B',
    isActive: (e) => e.isActive('blockquote'),
    run: (c) => c.toggleBlockquote(),
  },
  bulletList: {
    label: 'Bulleted list',
    icon: 'list-bullet',
    shortcut: 'Mod+Shift+8',
    isActive: (e) => e.isActive('bulletList'),
    run: (c) => c.toggleBulletList(),
  },
  orderedList: {
    label: 'Numbered list',
    icon: 'list-ordered',
    shortcut: 'Mod+Shift+7',
    isActive: (e) => e.isActive('orderedList'),
    run: (c) => c.toggleOrderedList(),
  },
  codeBlock: {
    label: 'Code block',
    icon: 'code-block',
    shortcut: 'Mod+Alt+C',
    isActive: (e) => e.isActive('codeBlock'),
    run: (c) => c.toggleCodeBlock(),
  },
  link: {
    label: 'Link',
    icon: 'link',
    shortcut: 'Mod+K',
    isActive: (e) => e.isActive('link'),
  },
  unlink: {
    label: 'Remove link',
    icon: 'unlink',
    isActive: () => false,
    isDisabled: (e) => !inLink(e),
    // With words selected only they lose the link; with just the cursor in one, the whole link goes.
    run: (c) => c.unsetLink(),
  },
}

/** The toolbar of the short description field. */
export const DESCRIPTION_TOOLS: ToolName[] = [
  'bold',
  'italic',
  'bulletList',
  'orderedList',
  'link',
  'unlink',
]

/** A run of tools that belong together: announced as a group, and set off from the next one by a rule. */
export interface ToolSection {
  label: string
  tools: ToolName[]
}

/** The sections of the draft's toolbar, in the order they show. */
export const DRAFT_SECTIONS: ToolSection[] = [
  { label: 'Text style', tools: ['paragraph', 'heading2', 'heading3'] },
  { label: 'Emphasis and links', tools: ['bold', 'italic', 'link', 'unlink'] },
  { label: 'Lists and quotes', tools: ['bulletList', 'orderedList', 'quote'] },
  { label: 'Code', tools: ['code', 'codeBlock'] },
]

/** The toolbar of the draft. */
export const DRAFT_TOOLS: ToolName[] = DRAFT_SECTIONS.flatMap((section) => section.tools)

const onMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** "Bold (Ctrl+B)", with ⌘ for Ctrl on a Mac. */
export function toolTitle(tool: Tool): string {
  if (!tool.shortcut) return tool.label
  return `${tool.label} (${tool.shortcut.replace('Mod', onMac ? '⌘' : 'Ctrl')})`
}

/**
 * A Ctrl or ⌘ click on a link in an editor opens it in a new tab, as it would on a page; a plain click places the
 * caret, as in any editor. Returns whether it handled the click (a ProseMirror `handleDOMEvents` handler).
 */
export function openLinkOnModClick(event: MouseEvent): boolean {
  const link = (event.target as HTMLElement).closest('a')
  if (!link || !(event.ctrlKey || event.metaKey)) return false
  event.preventDefault()
  window.open(link.href, '_blank', 'noopener')
  return true
}
