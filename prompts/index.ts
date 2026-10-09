import { readFileSync } from 'node:fs'

/**
 * Reads a prompt from the Markdown file beside this one. The whole file is the prompt, sent as written
 * (the evals read the same files). Read when the server starts, so restart it after editing one.
 */
function prompt(file: string): string {
  return readFileSync(new URL(file, import.meta.url), 'utf8').trim()
}

/** The editor that critiques a draft (the Critique button in the editor). */
export const CRITIQUE_PROMPT = prompt('critique.md')

/** The default brainstorming prompt: a commissioning editor. Each person can edit their own copy on their account page. */
export const DEFAULT_BRAINSTORM_PROMPT = prompt('brainstorm-default.md')

/** The brainstorming rules the app always adds after a person's prompt (tools, safety). People can't edit these. */
export const BRAINSTORM_RULES_PROMPT = prompt('brainstorm-rules.md')
