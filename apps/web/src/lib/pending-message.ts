import { reactive } from 'vue'

/**
 * A message typed on an idea's landing page, waiting to be sent when the Refine page opens. It is kept here, not in
 * the address, so what someone wrote is never part of a URL. Sending it is still the writer's press of Send.
 */
const pending = reactive(new Map<string, string>())
const key = (publicationId: string, ideaId: string) => `${publicationId}/${ideaId}`

export const holdMessage = (publicationId: string, ideaId: string, text: string) =>
  pending.set(key(publicationId, ideaId), text)

/** Hands over the held message, once. */
export function takeHeldMessage(publicationId: string, ideaId: string) {
  const text = pending.get(key(publicationId, ideaId))
  pending.delete(key(publicationId, ideaId))
  return text
}
