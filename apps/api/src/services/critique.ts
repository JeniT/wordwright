import {
  CRITIQUE_ROUNDS_DEFAULT,
  CritiqueSchema,
  type CritiqueState,
  MAX_CRITIQUE_POINTS,
  ModelCritiqueSchema,
  splitBlocks,
  type Block,
  type Critique,
} from '@lfwa/core'
import type { Store } from '../db/store'
import { venueDescriptionBlock } from './venue-context'

/**
 * What the model sees: the writer's description of the venue if there is one (see `venue-context.ts`), then the
 * title, then the draft as blocks, each with the id it must use to point at it.
 */
export function formatDraftForCritique(
  draft: { title: string; body: string },
  venueDescription: string | null = null,
): {
  message: string
  blocks: Block[]
} {
  const blocks = splitBlocks(draft.body)
  const message = [
    venueDescriptionBlock(venueDescription),
    `# ${draft.title}`,
    ...blocks.map((b) => `[${b.id}] ${b.text}`),
  ]
    .filter((part) => part !== null)
    .join('\n\n')
  return { message, blocks }
}

/** The start of a block, enough to tell which one it is. */
function excerptOf(text: string): string {
  const plain = text.replace(/\s+/g, ' ').trim()
  return plain.length > 90 ? `${plain.slice(0, 89)}…` : plain
}

/**
 * Reads the model's reply (JSON, perhaps in a code fence) into a `Critique`. The reply is untrusted: points about a
 * block we did not send are dropped and the rest are cut to `MAX_CRITIQUE_POINTS`. Returns null when the reply is
 * not a critique at all, or when every point it made was about something we never showed it.
 */
export function parseCritique(reply: string, blocks: readonly Block[]): Critique | null {
  const json = reply.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  const parsed = ModelCritiqueSchema.safeParse(raw)
  if (!parsed.success) return null

  const byId = new Map(blocks.map((b) => [b.id, b]))
  const points = parsed.data.points
    .filter((p) => p.block === 'whole' || byId.has(p.block))
    .slice(0, MAX_CRITIQUE_POINTS)
    .map((p) => ({
      block: p.block,
      excerpt: p.block === 'whole' ? '' : excerptOf(byId.get(p.block)!.text),
      hash: p.block === 'whole' ? null : byId.get(p.block)!.hash,
      point: p.point,
      reason: p.reason,
    }))
  if (parsed.data.points.length > 0 && points.length === 0) return null
  return CritiqueSchema.parse({ summary: parsed.data.summary, ready: parsed.data.ready, points })
}

/** How many critiques this person lets a draft have: their own setting, or the default. */
export function critiqueAllowance(store: Store, userId: string): number {
  return store.userSettings.getCritiqueRounds(userId) ?? CRITIQUE_ROUNDS_DEFAULT
}

/** The latest critique of a draft with how many looks are used and allowed, as the person asking sees them. */
export function critiqueState(store: Store, draftId: string, userId: string): CritiqueState {
  return {
    round: store.critiques.latest(draftId) ?? null,
    used: store.critiques.count(draftId),
    allowed: critiqueAllowance(store, userId),
  }
}
