import { z } from 'zod'

// ---- Shared field rules -------------------------------------------------

export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254))
/** Max length bounds the cost of hashing attacker-supplied input. */
export const PasswordSchema = z.string().min(10, 'Use at least 10 characters').max(128)
export const NameSchema = z.string().trim().min(1).max(100)

// ---- Accounts -----------------------------------------------------------

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  /** Whether we've confirmed the person controls this address. */
  emailVerified: z.boolean(),
  /** Has a local (email + password) credential. */
  hasPassword: z.boolean(),
  /** External identity providers linked to the account, e.g. ["google"]. */
  linkedProviders: z.array(z.string()),
})
export type User = z.infer<typeof UserSchema>

export const RegisterInputSchema = z.object({
  name: NameSchema,
  email: EmailSchema,
  password: PasswordSchema,
})
export type RegisterInput = z.infer<typeof RegisterInputSchema>

export const LoginInputSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(128),
})
export type LoginInput = z.infer<typeof LoginInputSchema>

export const ForgotPasswordInputSchema = z.object({ email: EmailSchema })
export const ResetPasswordInputSchema = z.object({
  token: z.string().min(1).max(200),
  password: PasswordSchema,
})

/** Deleting an account needs deliberate confirmation (and the password, if there is one). */
export const DeleteAccountInputSchema = z.object({
  confirmEmail: EmailSchema,
  password: z.string().max(128).optional(),
})

export const AuthConfigSchema = z.object({
  providers: z.array(z.object({ id: z.string(), label: z.string() })),
})
export type AuthConfig = z.infer<typeof AuthConfigSchema>

// ---- Profiles -----------------------------------------------------------

export const ProfileRoleSchema = z.enum(['owner', 'editor'])
export type ProfileRole = z.infer<typeof ProfileRoleSchema>

export const ProfileMemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: ProfileRoleSchema,
})
export type ProfileMember = z.infer<typeof ProfileMemberSchema>

export const ProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** The current user's role in this profile. */
  role: ProfileRoleSchema,
  members: z.array(ProfileMemberSchema),
})
export type Profile = z.infer<typeof ProfileSchema>

export const ProfileInputSchema = z.object({ name: NameSchema })
export const AddMemberInputSchema = z.object({ email: EmailSchema })

// ---- Drafts (belong to a profile) --------------------------------------

export const DraftSchema = z.object({
  id: z.string(),
  profileId: z.string(),
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

export const CritiqueRequestSchema = z.object({ draftId: z.string() })
export type CritiqueRequest = z.infer<typeof CritiqueRequestSchema>

export const CritiqueSchema = z.object({ text: z.string() })
export type Critique = z.infer<typeof CritiqueSchema>

// ---- Bring-your-own LLM credentials ------------------------------------

export const LLM_PROVIDER_IDS = ['anthropic'] as const
export const LLMProviderIdSchema = z.enum(LLM_PROVIDER_IDS)
export type LLMProviderId = z.infer<typeof LLMProviderIdSchema>

export const LLM_MODELS = {
  anthropic: [
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (balanced)' },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (most capable)' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest, cheapest)' },
  ],
} as const satisfies Record<LLMProviderId, readonly { id: string; label: string }[]>

export const DEFAULT_LLM_MODEL: Record<LLMProviderId, string> = { anthropic: 'claude-sonnet-5-5' }

/** What the client may see. The key itself is write-only. */
export const LlmSettingsSchema = z.object({
  provider: LLMProviderIdSchema,
  model: z.string(),
  hasKey: z.boolean(),
  /** e.g. "…a1b2", enough to recognise which key is stored. */
  keyHint: z.string().nullable(),
})
export type LlmSettings = z.infer<typeof LlmSettingsSchema>

export const LlmSettingsInputSchema = z.object({
  provider: LLMProviderIdSchema,
  model: z.string().max(100),
  /** Omit to keep the stored key and only change the model. */
  apiKey: z.string().trim().min(10).max(500).optional(),
})
export type LlmSettingsInput = z.infer<typeof LlmSettingsInputSchema>

/** Everything needed to talk to a model on a user's behalf. Never serialise this. */
export interface LLMConfig {
  provider: LLMProviderId
  apiKey: string
  model: string
}
