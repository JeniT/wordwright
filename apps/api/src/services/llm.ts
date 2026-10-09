import {
  DEFAULT_LLM_MODEL,
  LLM_MODELS,
  LLMAuthError,
  type LLMFactory,
  type LLMProvider,
  type LlmSettings,
  type LlmSettingsInput,
} from '@lfwa/core'
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

  /** Saves a new key (after checking it works) and/or a different model. */
  async save(userId: string, input: LlmSettingsInput): Promise<LlmSettings> {
    const { store, box, factory } = this.d
    if (!LLM_MODELS[input.provider].some((m) => m.id === input.model)) {
      throw new LlmError('invalid_model', 'Unknown model')
    }

    if (input.apiKey === undefined) {
      if (!store.credentials.get(userId)) throw new LlmError('missing_key', 'Enter an API key')
      store.credentials.setModel(userId, input.model)
      return this.settings(userId)
    }

    // Prove the key works before keeping it, so typos fail now rather than mid-draft.
    try {
      await factory({
        provider: input.provider,
        apiKey: input.apiKey,
        model: input.model,
      }).complete({
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 1,
      })
    } catch (err) {
      if (err instanceof LLMAuthError) {
        throw new LlmError(
          'key_rejected',
          'That API key was rejected by the provider. Please check it.',
        )
      }
      throw new LlmError(
        'provider_unreachable',
        "Couldn't reach the provider to check the key. Try again.",
      )
    }

    store.credentials.save(userId, {
      provider: input.provider,
      encryptedKey: box.encrypt(input.apiKey, context(userId, input.provider)),
      keyHint: `…${input.apiKey.slice(-4)}`,
      model: input.model,
    })
    return this.settings(userId)
  }

  remove(userId: string) {
    this.d.store.credentials.delete(userId)
  }

  /** An LLM client that spends this user's credits. */
  resolve(userId: string): LLMProvider {
    const stored = this.d.store.credentials.get(userId)
    if (!stored) {
      throw new LlmError(
        'not_configured',
        'Add your Anthropic API key in your account settings to use this feature',
      )
    }
    const apiKey = this.d.box.decrypt(stored.encryptedKey, context(userId, stored.provider))
    return this.d.factory({ provider: stored.provider, apiKey, model: stored.model })
  }
}

const context = (userId: string, provider: string) => `llm-key:${userId}:${provider}`
