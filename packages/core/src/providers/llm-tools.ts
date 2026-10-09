import { z } from 'zod'
import type { LLMTool } from './llm'

/**
 * Describes a tool from a Zod schema, so the same schema both tells the model what to send and
 * validates what comes back (always validate: a model's tool input is untrusted).
 */
export function llmTool(spec: { name: string; description: string; schema: z.ZodObject }): LLMTool {
  const { $schema: _unused, ...inputSchema } = z.toJSONSchema(spec.schema, { io: 'input' })
  void _unused
  // The model should send exactly the fields we ask for (input mode leaves this open by default).
  return {
    name: spec.name,
    description: spec.description,
    inputSchema: { additionalProperties: false, ...inputSchema },
  }
}
