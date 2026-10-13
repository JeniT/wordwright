import type { LLMProviderId } from '@lfwa/core'

/** How each provider is named to the writer. A new provider cannot be added without a name here. */
export const AI_PROVIDER_LABEL: Record<LLMProviderId, string> = { anthropic: 'Anthropic' }

/** What the AI icon means, shown as the tooltip and the description of every AI button, and on the account page. */
export function aiHint(provider?: LLMProviderId): string {
  return `Uses your ${provider ? AI_PROVIDER_LABEL[provider] : 'AI'} key, so it costs tokens`
}
