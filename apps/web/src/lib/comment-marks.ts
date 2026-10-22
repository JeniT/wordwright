import { WHOLE_DRAFT, locateBlock } from '@wordwright/core'
import { Extension } from '@tiptap/vue-3'
import type { Node as ProseNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * A comment, as the editor needs it to mark the paragraph it is about. The marks are decorations: they
 * are drawn over the document but are not part of it, so they never reach `getMarkdown()` or the saved draft.
 */
export interface CommentMarkPoint {
  id: string
  /** `b3` or `whole`. Only blocks get a mark; the whole-piece points live in the panel. */
  block: string
  hash: string | null
  excerpt: string
  /** The whole paragraph as it was, when it was kept: finds the paragraph again when it has been rewritten. */
  blockText?: string | null
  /** Shown on the mark: 1 for the most important point. */
  number: number
  /** Said by the mark to a screen reader. */
  label: string
  /** The AI's: marked in the highlighter colour, which is only for what the AI suggested. */
  byAi: boolean
  /** The selected words it is about, underlined where the paragraph still holds exactly those words. */
  quote?: string | null
  /** Only gives its paragraph the active edge (the comment being written): no number beside it. */
  edge?: boolean
  /** Resolved: still placed (so its comment can show its paragraph) but not marked in the text. */
  hidden?: boolean
}

export interface CommentMarkOptions {
  points: () => CommentMarkPoint[]
  activeId: () => string | null
  onPick: (id: string) => void
  /** Says which points found their paragraph in the text as it is now, and what that paragraph says (the others are gone). */
  onLocated: (paragraphs: Record<string, string>) => void
}

/** Where the words `quote` are in a paragraph that starts at `pos`, as document positions; null if it no longer holds them. */
function quoteRange(
  doc: ProseNode,
  pos: number,
  quote: string,
): { from: number; to: number } | null {
  const block = doc.nodeAt(pos)
  if (!block) return null
  const at = block.textContent.indexOf(quote)
  if (at === -1) return null
  // Text offsets to positions: only text nodes count towards the offset, and a hard break or image does not.
  let seen = 0
  let from = -1
  let to = -1
  block.descendants((node, offset) => {
    if (!node.isText) return true
    const start = pos + 1 + offset
    const length = node.text!.length
    if (from === -1 && at < seen + length) from = start + (at - seen)
    if (to === -1 && at + quote.length <= seen + length) to = start + (at + quote.length - seen)
    seen += length
    return true
  })
  return from === -1 || to === -1 ? null : { from, to }
}

export const commentMarksKey = new PluginKey('commentMarks')

/** Where each point's paragraph is in the document now, by the point's id. Kept in the editor's storage. */
export interface CommentMarkStorage {
  positions: Map<string, number>
  /** The words of that paragraph now, by the point's id. */
  texts: Map<string, string>
}

/** The paragraphs (and headings, code blocks...) that hold text, with where each starts. */
export function textBlocks(doc: ProseNode) {
  const blocks: { pos: number; size: number; text: string }[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    if (node.textContent.trim()) blocks.push({ pos, size: node.nodeSize, text: node.textContent })
    return false
  })
  return blocks
}

export const CommentMarks = Extension.create<CommentMarkOptions, CommentMarkStorage>({
  name: 'commentMarks',

  addOptions: () => ({
    points: () => [],
    activeId: () => null,
    onPick: () => {},
    onLocated: () => {},
  }),

  addStorage: () => ({ positions: new Map<string, number>(), texts: new Map<string, string>() }),

  addProseMirrorPlugins() {
    const { options, storage } = this

    /** Works out which paragraph each point belongs to; the one place that decides. */
    function place(doc: ProseNode) {
      const blocks = textBlocks(doc)
      const positions = new Map<string, number>()
      const texts = new Map<string, string>()
      const byBlock = new Map<number, CommentMarkPoint[]>()
      for (const p of options.points()) {
        if (p.block === WHOLE_DRAFT || p.hash === null) continue
        const at = locateBlock(
          {
            hash: p.hash,
            excerpt: p.excerpt,
            text: p.blockText,
            index: Number(p.block.slice(1)) - 1,
          },
          blocks,
        )
        if (at === null) continue
        positions.set(p.id, blocks[at]!.pos)
        texts.set(p.id, blocks[at]!.text)
        if (!p.hidden) byBlock.set(at, [...(byBlock.get(at) ?? []), p])
      }
      return { blocks, positions, texts, byBlock }
    }

    function widget(points: CommentMarkPoint[], active: string | null) {
      const wrap = document.createElement('span')
      wrap.className = 'comment-marks'
      wrap.contentEditable = 'false'
      for (const p of points) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = p.byAi ? 'comment-marker is-ai' : 'comment-marker'
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
        key: commentMarksKey,
        props: {
          decorations: (state) => {
            const { blocks, positions, texts, byBlock } = place(state.doc)
            storage.positions = positions
            storage.texts = texts
            const active = options.activeId()
            const decorations: Decoration[] = []
            for (const [at, points] of byBlock) {
              const b = blocks[at]!
              const isActive = points.some((p) => p.id === active)
              const classes = ['comment-block']
              if (!points.some((p) => p.byAi)) classes.push('is-person')
              if (isActive) classes.push('is-active')
              decorations.push(Decoration.node(b.pos, b.pos + b.size, { class: classes.join(' ') }))
              const numbered = points.filter((p) => !p.edge)
              if (numbered.length) {
                decorations.push(
                  Decoration.widget(b.pos + b.size - 1, () => widget(numbered, active), {
                    side: 1,
                    key: numbered.map((p) => `${p.id}${p.id === active ? '*' : ''}`).join(),
                  }),
                )
              }
              for (const p of points) {
                const range = p.quote ? quoteRange(state.doc, b.pos, p.quote) : null
                if (range) {
                  decorations.push(
                    Decoration.inline(range.from, range.to, {
                      class: p.byAi ? 'comment-quote is-ai' : 'comment-quote',
                    }),
                  )
                }
              }
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
            const paragraphs = Object.fromEntries(storage.texts)
            const key = JSON.stringify(Object.entries(paragraphs).sort())
            if (key === lastLocated) return
            lastLocated = key
            options.onLocated(paragraphs)
          }
          queueMicrotask(report)
          return { update: report }
        },
      }),
    ]
  },
})
