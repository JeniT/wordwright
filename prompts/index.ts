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

/** The Rephrase window: options for a passage or title the writer is stuck on, which they choose from and edit. */
export const OPTIONS_PROMPT = prompt('options.md')

/** The default brainstorming prompt: a writing coach. */
export const DEFAULT_BRAINSTORM_PROMPT = prompt('brainstorm-default.md')

/** The brainstorming rules the app always adds after it (tools, safety). People can't edit these. */
export const BRAINSTORM_RULES_PROMPT = prompt('brainstorm-rules.md')

/** Sent as the writer's first turn, with the idea snapshot, to make the AI open the session itself. */
export const BRAINSTORM_KICKOFF_PROMPT = prompt('brainstorm-kickoff.md')

/** The researcher behind the Research page: searches the web and reports pages for the writer's reading list. */
export const RESEARCH_PROMPT = prompt('research.md')

/** What the AI is told the `add_note`, `update_idea`, `create_idea`, `suggest_reading` and `name_conversation` tools do (shown to it with the tool). */
export const ADD_NOTE_TOOL_PROMPT = prompt('tool-add-note.md')
export const UPDATE_IDEA_TOOL_PROMPT = prompt('tool-update-idea.md')
export const CREATE_IDEA_TOOL_PROMPT = prompt('tool-create-idea.md')
export const SUGGEST_READING_TOOL_PROMPT = prompt('tool-suggest-reading.md')
export const NAME_CONVERSATION_TOOL_PROMPT = prompt('tool-name-conversation.md')
