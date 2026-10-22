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
  /** Tools of one group sit together and are announced as a group (the text styles are a choice of one). */
  group?: string
  isActive: (editor: Editor) => boolean
  /** An action, not a state: it is never "pressed", and is off when it would do nothing. */
  isDisabled?: (editor: Editor) => boolean
  /** Not set for the link, which asks for an address first (see EditorToolbar). */
  run?: (chain: Chain) => Chain
}

const STYLES = 'Text style'

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
    group: STYLES,
    isActive: (e) =>
      e.isActive('paragraph') && !e.isActive('listItem') && !e.isActive('blockquote'),
    run: (c) => c.setParagraph(),
  },
  heading2: {
    label: 'Heading 2',
    icon: 'heading-2',
    shortcut: 'Mod+Alt+2',
    group: STYLES,
    isActive: (e) => e.isActive('heading', { level: 2 }),
    run: (c) => c.toggleHeading({ level: 2 }),
  },
  heading3: {
    label: 'Heading 3',
    icon: 'heading-3',
    shortcut: 'Mod+Alt+3',
    group: STYLES,
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

/** The toolbar of the draft, in the order it shows. */
export const DRAFT_TOOLS: ToolName[] = [
  'paragraph',
  'heading2',
  'heading3',
  'bold',
  'italic',
  'link',
  'unlink',
  'bulletList',
  'orderedList',
  'quote',
  'code',
  'codeBlock',
]

/** The draft's tools that end a section: a divider follows each, unless nothing is left after it on the bar. */
export const DRAFT_DIVIDERS: ToolName[] = ['heading3', 'unlink', 'quote']

const onMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** "Bold (Ctrl+B)", with ⌘ for Ctrl on a Mac. */
export function toolTitle(tool: Tool): string {
  if (!tool.shortcut) return tool.label
  return `${tool.label} (${tool.shortcut.replace('Mod', onMac ? '⌘' : 'Ctrl')})`
}
