import { reactive } from 'vue'

/**
 * A message typed on an idea's landing page, waiting to be sent when the Refine page opens. It is kept here, not in
 * the address, so what someone wrote is never part of a URL. Sending it is still the writer's press of Send.
 */
const pending = reactive(new Map<string, string>())
const key = (profileId: string, ideaId: string) => `${profileId}/${ideaId}`

export const holdMessage = (profileId: string, ideaId: string, text: string) =>
  pending.set(key(profileId, ideaId), text)

/** Hands over the held message, once. */
export function takeHeldMessage(profileId: string, ideaId: string) {
  const text = pending.get(key(profileId, ideaId))
  pending.delete(key(profileId, ideaId))
  return text
}
