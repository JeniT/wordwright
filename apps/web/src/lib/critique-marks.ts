import { locateBlock } from '@lfwa/core'
import { Extension } from '@tiptap/vue-3'
import type { Node as ProseNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * A comment, as the editor needs it to mark the paragraph it is about. The marks are decorations: they
 * are drawn over the document but are not part of it, so they never reach `getMarkdown()` or the saved draft.
 */
export interface CritiqueMarkPoint {
  id: string
  /** `b3` or `whole`. Only blocks get a mark; the whole-piece points live in the panel. */
  block: string
  hash: string | null
  excerpt: string
  /** Shown on the mark: 1 for the most important point. */
  number: number
  /** Said by the mark to a screen reader. */
  label: string
  /** The AI's: marked in the highlighter colour, which is only for what the AI suggested. */
  byAi: boolean
  /** Resolved: still placed (so its comment can show its paragraph) but not marked in the text. */
  hidden?: boolean
}

export interface CritiqueMarkOptions {
  points: () => CritiqueMarkPoint[]
  activeId: () => string | null
  onPick: (id: string) => void
  /** Says which points found their paragraph in the text as it is now (the others have "changed"). */
  onLocated: (ids: string[]) => void
}

export const critiqueMarksKey = new PluginKey('critiqueMarks')

/** Where each point's paragraph is in the document now, by the point's id. Kept in the editor's storage. */
export interface CritiqueMarkStorage {
  positions: Map<string, number>
}

/** The paragraphs (and headings, code blocks...) that hold text, with where each starts. */
function textBlocks(doc: ProseNode) {
  const blocks: { pos: number; size: number; text: string }[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    if (node.textContent.trim()) blocks.push({ pos, size: node.nodeSize, text: node.textContent })
    return false
  })
  return blocks
}

export const CritiqueMarks = Extension.create<CritiqueMarkOptions, CritiqueMarkStorage>({
  name: 'critiqueMarks',

  addOptions: () => ({
    points: () => [],
    activeId: () => null,
    onPick: () => {},
    onLocated: () => {},
  }),

  addStorage: () => ({ positions: new Map<string, number>() }),

  addProseMirrorPlugins() {
    const { options, storage } = this

    /** Works out which paragraph each point belongs to; the one place that decides. */
    function place(doc: ProseNode) {
      const blocks = textBlocks(doc)
      const positions = new Map<string, number>()
      const byBlock = new Map<number, CritiqueMarkPoint[]>()
      for (const p of options.points()) {
        if (p.block === 'whole' || p.hash === null) continue
        const at = locateBlock(
          { hash: p.hash, excerpt: p.excerpt, index: Number(p.block.slice(1)) - 1 },
          blocks,
        )
        if (at === null) continue
        positions.set(p.id, blocks[at]!.pos)
        if (!p.hidden) byBlock.set(at, [...(byBlock.get(at) ?? []), p])
      }
      return { blocks, positions, byBlock }
    }

    function widget(points: CritiqueMarkPoint[], active: string | null) {
      const wrap = document.createElement('span')
      wrap.className = 'critique-marks'
      wrap.contentEditable = 'false'
      for (const p of points) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = p.byAi
          ? 'btn btn-sm btn-icon critique-mark'
          : 'btn btn-sm btn-icon critique-mark is-person'
        button.dataset.pointId = p.id
        button.textContent = String(p.number)
        button.setAttribute('aria-label', p.label)
        button.title = p.label
        if (p.id === active) button.setAttribute('aria-current', 'true')
        wrap.append(button)
      }
      return wrap
    }

    let lastLocated = ''
    return [
      new Plugin({
        key: critiqueMarksKey,
        props: {
          decorations: (state) => {
            const { blocks, positions, byBlock } = place(state.doc)
            storage.positions = positions
            const active = options.activeId()
            const decorations: Decoration[] = []
            for (const [at, points] of byBlock) {
              const b = blocks[at]!
              const isActive = points.some((p) => p.id === active)
              const classes = ['critique-block']
              if (!points.some((p) => p.byAi)) classes.push('is-person')
              if (isActive) classes.push('is-active')
              decorations.push(
                Decoration.node(b.pos, b.pos + b.size, { class: classes.join(' ') }),
                Decoration.widget(b.pos + b.size - 1, () => widget(points, active), {
                  side: 1,
                  key: points.map((p) => `${p.id}${p.id === active ? '*' : ''}`).join(),
                }),
              )
            }
            return DecorationSet.create(state.doc, decorations)
          },
          handleDOMEvents: {
            // The mark is a button inside the text: pressing it must not move the writer's cursor.
            mousedown: (_view, event) =>
              (event.target as HTMLElement).closest('[data-point-id]')
                ? (event.preventDefault(), true)
                : false,
            click: (_view, event) => {
              const id = (event.target as HTMLElement).closest<HTMLElement>('[data-point-id]')
                ?.dataset.pointId
              if (!id) return false
              options.onPick(id)
              return true
            },
          },
        },
        view: () => {
          // Told after the view has drawn (and once at the start), not while the decorations are being worked out.
          const report = () => {
            const ids = [...storage.positions.keys()].sort()
            const key = ids.join()
            if (key === lastLocated) return
            lastLocated = key
            options.onLocated(ids)
          }
          queueMicrotask(report)
          return { update: report }
        },
      }),
    ]
  },
})
