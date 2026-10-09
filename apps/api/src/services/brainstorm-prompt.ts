import type { BrainstormPrompt } from '@lfwa/core'
import { DEFAULT_BRAINSTORM_PROMPT } from '@lfwa/prompts'
import type { Store } from '../db/store'

/**
 * The prompt that tells the AI how to brainstorm: a person's own version, or the default from
 * `prompts/brainstorm-default.md`. A version identical to the default is not stored, so that
 * improving the default reaches everyone who hasn't really changed it.
 */
export class BrainstormPromptService {
  constructor(
    private readonly store: Store,
    private readonly defaultPrompt: string = DEFAULT_BRAINSTORM_PROMPT,
  ) {}

  get(userId: string): BrainstormPrompt {
    const own = this.store.userPrompts.getBrainstorm(userId)
    return own === undefined
      ? { prompt: this.defaultPrompt, isDefault: true }
      : { prompt: own, isDefault: false }
  }

  /** What to send the model for this person. */
  effective(userId: string): string {
    return this.get(userId).prompt
  }

  /** `prompt` has already been trimmed by the schema. Line endings are normalised so edits compare fairly. */
  save(userId: string, prompt: string): BrainstormPrompt {
    const text = prompt.replace(/\r\n?/g, '\n')
    if (text === this.defaultPrompt) this.store.userPrompts.clearBrainstorm(userId)
    else this.store.userPrompts.setBrainstorm(userId, text)
    return this.get(userId)
  }

  reset(userId: string): BrainstormPrompt {
    this.store.userPrompts.clearBrainstorm(userId)
    return this.get(userId)
  }
}
