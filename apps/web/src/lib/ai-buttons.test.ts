import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every button that makes an AI request (and so spends the writer's tokens) is an `AiButton`, so the writer can
 * see that before pressing. The API functions that make such a request are tagged `@ai` in `api.ts`; this test
 * fails when one is used from a component that does not use `AiButton`, and when the list below changes.
 * Adding an AI function: tag it, add it here, and give its button the AI pattern (docs/design.md).
 */
const AI_API_FUNCTIONS = ['critique', 'rephrase', 'runResearch', 'streamReply']

const src = join(__dirname, '..')
function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? vueFiles(join(dir, e.name))
      : e.name.endsWith('.vue')
        ? [join(dir, e.name)]
        : [],
  )
}

describe('AI buttons', () => {
  it('lists the API functions that call the AI', () => {
    const api = readFileSync(join(src, 'lib/api.ts'), 'utf8')
    const tagged = [...api.matchAll(/@ai\s*\*\/\s*(?:async\s+)?([A-Za-z]+)\s*[:(]/g)].map(
      (m) => m[1],
    )
    expect(tagged.sort()).toEqual(AI_API_FUNCTIONS)
  })

  it('are used wherever the app calls one', () => {
    const callers = vueFiles(src)
      .map((file) => ({ file, text: readFileSync(file, 'utf8') }))
      .filter(({ text }) => AI_API_FUNCTIONS.some((name) => text.includes(`api.${name}(`)))
    // Critique (editor), Rephrase, Brainstorm Send, and Research.
    expect(callers.map((c) => c.file.slice(src.length + 1)).sort()).toEqual([
      'components/RephraseDialog.vue',
      'components/ResearchForm.vue',
      'views/BrainstormView.vue',
      'views/EditorView.vue',
    ])
    for (const { file, text } of callers) {
      expect(text, file).toMatch(/^import AiButton from '(\.\.\/components|\.)\/AiButton\.vue'$/m)
    }
  })

  it('include the buttons that hand over to a call', () => {
    // These start no request themselves, but the page they lead to sends at once, so they carry the icon too.
    for (const file of ['components/RecentRefine.vue', 'views/BrainstormView.vue']) {
      const text = readFileSync(join(src, file), 'utf8')
      expect(text, file).toMatch(/^import AiButton from /m)
      expect(text.includes('<button'), file).toBe(file.endsWith('BrainstormView.vue')) // Stop is the one plain button
    }
  })

  it('never wear the icon on a button that makes no AI call', () => {
    for (const file of vueFiles(src)) {
      if (file.endsWith('AiButton.vue') || file.endsWith('Icon.vue')) continue
      const text = readFileSync(file, 'utf8')
      expect(text.includes('name="ai"'), file).toBe(file.endsWith('HelpAiSettingsView.vue'))
    }
  })
})
