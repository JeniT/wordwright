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

/** Sent as the writer's first turn, with the idea snapshot, to make the AI open the session itself. */
export const BRAINSTORM_KICKOFF_PROMPT = prompt('brainstorm-kickoff.md')

/** What the AI is told the `update_idea` and `create_idea` tools do (shown to it with the tool). */
export const UPDATE_IDEA_TOOL_PROMPT = prompt('tool-update-idea.md')
export const CREATE_IDEA_TOOL_PROMPT = prompt('tool-create-idea.md')
