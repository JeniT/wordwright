import {
  LLM_MODELS,
  LLM_PROVIDER_IDS,
  type LLMProvider,
  type LLMProviderId,
  type ResearchProvider,
} from '@lfwa/core'
import {
  fakeLlmFactory,
  fakeResearchFactory,
  realLlmFactory,
  realResearchFactory,
} from '../../apps/api/src/llm-factory'

export interface AdapterChoice {
  /** An id from `LLM_PROVIDER_IDS`, or `fake` for a dry run that needs no key. */
  provider: string
  model: string
}

/** Where the choice and key come from. Set by `run.ts`; read here so the provider has no other inputs. */
export function choiceFromEnv(env: NodeJS.ProcessEnv = process.env): AdapterChoice {
  const provider = env.EVAL_PROVIDER || 'anthropic'
  const model = env.EVAL_MODEL || defaultModel(provider)
  return { provider, model }
}

export function defaultModel(provider: string): string {
  if (provider === 'fake') return 'fake'
  const models = LLM_MODELS[provider as LLMProviderId]
  if (!models)
    throw new Error(`Unknown provider "${provider}". Known: ${LLM_PROVIDER_IDS.join(', ')}, fake`)
  return models[0].id
}

/**
 * The adapter under test, built by the same factory the app uses, so a new adapter registered in
 * `apps/api/src/llm-factory.ts` is evaluated with no change here.
 */
export function buildAdapter(
  choice: AdapterChoice,
  env: NodeJS.ProcessEnv = process.env,
): LLMProvider {
  if (choice.provider === 'fake')
    return fakeLlmFactory({ provider: 'anthropic', apiKey: 'fake', model: 'fake' })
  const apiKey = env.EVAL_API_KEY || env[`${choice.provider.toUpperCase()}_API_KEY`]
  if (!apiKey) {
    throw new Error(
      `No API key. Set EVAL_API_KEY (or ${choice.provider.toUpperCase()}_API_KEY) to run against ${choice.provider}.`,
    )
  }
  return realLlmFactory({ provider: choice.provider as LLMProviderId, apiKey, model: choice.model })
}

/** The web-searching researcher for the same choice, built by the app's own factory. */
export function buildResearch(
  choice: AdapterChoice,
  env: NodeJS.ProcessEnv = process.env,
): ResearchProvider {
  if (choice.provider === 'fake')
    return fakeResearchFactory({ provider: 'anthropic', apiKey: 'fake', model: 'fake' })
  const apiKey = env.EVAL_API_KEY || env[`${choice.provider.toUpperCase()}_API_KEY`]
  if (!apiKey) {
    throw new Error(
      `No API key. Set EVAL_API_KEY (or ${choice.provider.toUpperCase()}_API_KEY) to run against ${choice.provider}.`,
    )
  }
  return realResearchFactory({
    provider: choice.provider as LLMProviderId,
    apiKey,
    model: choice.model,
  })
}
