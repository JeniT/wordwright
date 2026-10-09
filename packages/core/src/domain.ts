import { z } from 'zod'

export const DraftSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Markdown source of the piece. */
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Draft = z.infer<typeof DraftSchema>

export const DraftInputSchema = z.object({
  title: z.string().max(300).default(''),
  body: z.string().default(''),
})
export type DraftInput = z.infer<typeof DraftInputSchema>

export const CritiqueRequestSchema = z.object({
  draftId: z.string(),
})
export type CritiqueRequest = z.infer<typeof CritiqueRequestSchema>

export const CritiqueSchema = z.object({
  text: z.string(),
})
export type Critique = z.infer<typeof CritiqueSchema>
