import { blockHash, excerptOf, locateBlock } from '@wordwright/core'

/**
 * The saved draft's block (`b3`...) that the editor's paragraph is: found by its words, near where it is, because the
 * editor counts every paragraph of a list or quote while the saved Markdown groups some of them, so their places can
 * differ. Null when it can't be found, and the comment is then general rather than on the wrong paragraph.
 */
export function blockFor(
  at: { index: number; text: string },
  blocks: readonly { id: string; text: string }[],
): { id: string; number: number } | null {
  const found = locateBlock(
    { hash: blockHash(at.text), excerpt: excerptOf(at.text), index: at.index },
    blocks,
  )
  return found === null ? null : { id: blocks[found]!.id, number: found + 1 }
}
