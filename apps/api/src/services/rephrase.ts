import {
  ModelRephraseSchema,
  REPHRASE,
  countWords,
  maxOptionWords,
  normalizeAim,
  rephraseSize,
  wordingProblem,
  type RephraseRequest,
  type RephraseSize,
} from '@lfwa/core'
import { fail } from '../errors'
import { escape, venueDescriptionBlock } from './venue-context'

export const NOT_ENOUGH_OPTIONS = `The AI didn't give enough usable options. Try saying your aim a different way, or write it yourself.`

/**
 * Checks a request before anything is sent or spent: the wording is something that can be rephrased, the Aim says
 * something, a title has enough draft to work from, and a further round has a different Aim. The server counts
 * nothing: how many rounds a window allows is the window's business (docs/decisions.md).
 */
export function checkRephrase(req: RephraseRequest, draft: { body: string }) {
  const problem = wordingProblem(req.kind, req.wording)
  if (problem) throw fail(400, problem)
  if (countWords(req.aim) < REPHRASE.aimMinWords) {
    throw fail(400, 'Say in a few words what you want this to do, so the options fit.')
  }
  if (req.kind === 'title' && countWords(draft.body) < REPHRASE.titleMinBodyWords) {
    throw fail(
      400,
      `Write more first. Options for a title come from what you've written, and work best once the draft is nearly done.`,
    )
  }
  const aim = normalizeAim(req.aim)
  if (req.earlier.some((round) => normalizeAim(round.aim) === aim)) {
    throw fail(400, `Change your aim before asking again: say what you'd like to be different.`)
  }
}

/**
 * What the model sees: the venue's description if there is one, then the draft and the wording, the Aim and anything
 * already offered in this window. Nothing else is ever sent: no notes, brainstorm messages or comments (a test holds
 * that). All of it is the writer's own text, so it is escaped and the prompt says it is material, not instructions.
 */
export function formatRephraseMessage(
  req: Pick<RephraseRequest, 'kind' | 'wording' | 'aim' | 'earlier'>,
  draft: { title: string; body: string },
  venueDescription: string | null,
): string {
  const ask = REPHRASE[rephraseSize(req.kind, req.wording)].ask
  return [
    venueDescriptionBlock(venueDescription),
    `<draft_title>${escape(draft.title)}</draft_title>`,
    `<draft>\n${escape(draft.body)}\n</draft>`,
    `<wording kind="${req.kind}">\n${escape(req.wording)}\n</wording>`,
    `<aim>\n${escape(req.aim)}\n</aim>`,
    ...req.earlier.map((round) =>
      [
        '<earlier_round>',
        `<aim>${escape(round.aim)}</aim>`,
        ...round.options.map((o) => `<option>${escape(o)}</option>`),
        '</earlier_round>',
      ].join('\n'),
    ),
    req.earlier.length
      ? `Offer ${ask} options. They must differ from every option already offered above.`
      : `Offer ${ask} options.`,
  ]
    .filter((part) => part !== null)
    .join('\n\n')
}

/**
 * Reads the model's reply (JSON, perhaps in a code fence) into the options we will show. The reply is untrusted:
 * blanks, repeats, the wording itself, anything already offered and anything too long for the wording are dropped,
 * and the rest are cut to the most we show. Returns null when the reply is not options at all, or too few remain.
 */
export function parseOptions(
  reply: string,
  req: Pick<RephraseRequest, 'kind' | 'wording' | 'earlier'>,
): { size: RephraseSize; options: string[] } | null {
  const json = reply.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  const parsed = ModelRephraseSchema.safeParse(raw)
  if (!parsed.success) return null

  const size = rephraseSize(req.kind, req.wording)
  const longest = maxOptionWords(req.kind, req.wording)
  const seen = new Set([
    normalizeAim(req.wording),
    ...req.earlier.flatMap((r) => r.options.map(normalizeAim)),
  ])
  const options: string[] = []
  for (const candidate of parsed.data.options) {
    const option = candidate.trim()
    const key = normalizeAim(option)
    if (!option || seen.has(key) || countWords(option) > longest) continue
    seen.add(key)
    options.push(option)
  }
  const limits = REPHRASE[size]
  if (options.length < limits.min) return null
  return { size, options: options.slice(0, limits.max) }
}
