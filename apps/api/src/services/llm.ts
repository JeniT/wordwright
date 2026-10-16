import {
  DEFAULT_LLM_MODEL,
  LLMAuthError,
  type LLMConfig,
  type LLMFactory,
  type LLMModelInfo,
  type LLMProvider,
  type LlmSettings,
  type LlmSettingsInput,
  type ResearchFactory,
  type ResearchProvider,
} from '@wordwright/core'
import type { SecretBox } from '../auth/secret-box'
import type { Store } from '../db/store'

export class LlmError extends Error {
  constructor(
    readonly code:
      'not_configured' | 'invalid_model' | 'missing_key' | 'key_rejected' | 'provider_unreachable',
    message: string,
  ) {
    super(message)
  }
}

export interface LlmKeyServiceDeps {
  store: Store
  box: SecretBox
  factory: LLMFactory
  /** Builds the web-searching researcher from the same credentials. */
  researchFactory: ResearchFactory
}

/** Users bring their own LLM credentials; this stores them and builds clients from them. */
export class LlmKeyService {
  constructor(private readonly d: LlmKeyServiceDeps) {}

  settings(userId: string): LlmSettings {
    const stored = this.d.store.credentials.get(userId)
    if (!stored) {
      return {
        provider: 'anthropic',
        model: DEFAULT_LLM_MODEL.anthropic,
        hasKey: false,
        keyHint: null,
      }
    }
    return { provider: stored.provider, model: stored.model, hasKey: true, keyHint: stored.keyHint }
  }

  /**
   * The models to offer this person: the current ones, plus the model they already use if the provider still
   * supports it, so keeping an older model is possible but new people aren't steered to it.
   */
  async models(userId: string): Promise<LLMModelInfo[]> {
    const config = this.config(userId)
    const all = await this.listModels(
      config,
      'Your saved API key was rejected by the provider. Replace it.',
    )
    return offered(all, config.model)
  }

  /**
   * Saves a new key and/or a different model. A key is checked by listing the models it can use, which spends no
   * tokens, and a model must be one of those, so a typo or a retired model fails now rather than mid-draft.
   */
  async save(userId: string, input: LlmSettingsInput): Promise<LlmSettings> {
    const { store, box } = this.d
    const stored = store.credentials.get(userId)

    if (input.apiKey === undefined) {
      if (!stored) throw new LlmError('missing_key', 'Enter an API key')
      const models = await this.models(userId)
      store.credentials.setModel(userId, this.pickModel(models, input.model, stored.model))
      return this.settings(userId)
    }

    const models = offered(
      await this.listModels(
        {
          provider: input.provider,
          apiKey: input.apiKey,
          model: input.model ?? DEFAULT_LLM_MODEL[input.provider],
        },
        'That API key was rejected by the provider. Please check it.',
      ),
      stored?.model,
    )
    const model = this.pickModel(
      models,
      input.model,
      stored?.model ?? DEFAULT_LLM_MODEL[input.provider],
    )
    store.credentials.save(userId, {
      provider: input.provider,
      encryptedKey: box.encrypt(input.apiKey, context(userId, input.provider)),
      keyHint: `…${input.apiKey.slice(-4)}`,
      model,
    })
    return this.settings(userId)
  }

  remove(userId: string) {
    this.d.store.credentials.delete(userId)
  }

  /** Like `resolve`, plus which provider and model it is, for recording who said what. */
  resolveWithInfo(userId: string): { llm: LLMProvider; provider: string; model: string } {
    const llm = this.resolve(userId)
    const { provider, model } = this.d.store.credentials.get(userId)!
    return { llm, provider, model }
  }

  /** Like `resolveWithInfo`, for the researcher that searches the web with this user's credentials. */
  resolveResearchWithInfo(userId: string): {
    research: ResearchProvider
    provider: string
    model: string
  } {
    const config = this.config(userId)
    return {
      research: this.d.researchFactory(config),
      provider: config.provider,
      model: config.model,
    }
  }

  /** An LLM client that spends this user's credits. */
  resolve(userId: string): LLMProvider {
    return this.d.factory(this.config(userId))
  }

  /** What was asked for if it is on offer; with no ask, the current model, else the first one offered. */
  private pickModel(models: LLMModelInfo[], asked: string | undefined, current: string): string {
    if (models.length === 0) {
      throw new LlmError(
        'invalid_model',
        'The provider offers no models to this key. Check the key’s access.',
      )
    }
    if (asked !== undefined) {
      if (!models.some((m) => m.id === asked)) {
        throw new LlmError(
          'invalid_model',
          'That model isn’t available to your key. Choose another.',
        )
      }
      return asked
    }
    return models.some((m) => m.id === current) ? current : models[0]!.id
  }

  private async listModels(config: LLMConfig, rejected: string): Promise<LLMModelInfo[]> {
    try {
      return await this.d.factory(config).listModels()
    } catch (err) {
      if (err instanceof LLMAuthError) throw new LlmError('key_rejected', rejected)
      throw new LlmError(
        'provider_unreachable',
        'Couldn’t reach the provider to check the key. Try again.',
      )
    }
  }

  private config(userId: string): LLMConfig {
    const stored = this.d.store.credentials.get(userId)
    if (!stored) {
      throw new LlmError(
        'not_configured',
        'Add your Anthropic API key in your account settings to use this feature',
      )
    }
    const apiKey = this.d.box.decrypt(stored.encryptedKey, context(userId, stored.provider))
    return { provider: stored.provider, apiKey, model: stored.model }
  }
}

/** The latest models, and the one already in use (if the provider still lists it), in the provider's order. */
const offered = (models: LLMModelInfo[], current: string | undefined) =>
  models.filter((m) => m.latest || m.id === current)

const context = (userId: string, provider: string) => `llm-key:${userId}:${provider}`
