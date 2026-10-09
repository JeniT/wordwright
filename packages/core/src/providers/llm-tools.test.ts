import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { llmTool } from './llm-tools'

describe('llmTool', () => {
  const schema = z.object({
    name: z.string().min(1).max(200).describe('The new title'),
    notes: z.string().optional(),
  })

  it('describes the tool with a JSON Schema derived from the Zod schema', () => {
    const tool = llmTool({ name: 'update_idea', description: 'Propose a change', schema })
    expect(tool).toMatchObject({ name: 'update_idea', description: 'Propose a change' })
    expect(tool.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The new title' },
        notes: { type: 'string' },
      },
      required: ['name'],
      additionalProperties: false,
    })
    expect(tool.inputSchema).not.toHaveProperty('$schema')
  })

  it('leaves the schema itself to validate what the model sends', () => {
    expect(schema.safeParse({ name: 'Fine' }).success).toBe(true)
    expect(schema.safeParse({ name: '' }).success).toBe(false)
    expect(schema.safeParse({ name: 'x', extra: 1 }).success).toBe(true) // unknown keys are dropped, not trusted
  })
})
