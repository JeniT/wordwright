import { z } from 'zod'
import { HANDLE_MAX, HANDLE_MIN, HANDLE_PATTERN } from './ids'

// ---- Shared field rules -------------------------------------------------

export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254))
/** Max length bounds the cost of hashing attacker-supplied input. */
export const PasswordSchema = z.string().min(10, 'Use at least 10 characters').max(128)
export const NameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name')
  .max(100, 'Use 100 characters or fewer for the name')
export const HandleSchema = z.string().min(HANDLE_MIN).max(HANDLE_MAX).regex(HANDLE_PATTERN)
/** What people type as a username: tolerant of case and stray spaces, strict about the result. */
export const UsernameInputSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .min(HANDLE_MIN, `Use at least ${HANDLE_MIN} characters for your username`)
      .max(HANDLE_MAX, `Use ${HANDLE_MAX} characters or fewer for your username`)
      .regex(HANDLE_PATTERN, 'Use only letters and numbers in your username'),
  )

/** People type "mysite.substack.com"; assume https. Only web addresses are accepted, never e.g. javascript:. */
const withScheme = (text: string) => (/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`)
export const SiteUrlSchema = z
  .string()
  .trim()
  .max(300, 'That web address is too long')
  .transform(withScheme)
  .pipe(z.url({ protocol: /^https?$/, message: 'Enter a web address, like https://example.com' }))

// ---- Accounts -----------------------------------------------------------

export const UserSchema = z.object({
  id: z.string(),
  /** Short, unique, lower-case name that prefixes the ids of profiles this person creates. */
  handle: HandleSchema,
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
  handle: UsernameInputSchema,
  email: EmailSchema,
  password: PasswordSchema,
})
export type RegisterInput = z.infer<typeof RegisterInputSchema>

export const HandleAvailabilitySchema = z.object({ available: z.boolean() })
export type HandleAvailability = z.infer<typeof HandleAvailabilitySchema>

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

export const VerifyEmailInputSchema = z.object({ token: z.string().min(1).max(200) })

/** Changing a password while signed in re-checks the current one. */
export const ChangePasswordInputSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: PasswordSchema,
})

/** Changing the email address re-checks the password, like changing the password does. */
export const ChangeEmailInputSchema = z.object({
  newEmail: EmailSchema,
  password: z.string().min(1).max(128),
})
export type ChangeEmailInput = z.infer<typeof ChangeEmailInputSchema>

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
  /** Human-readable and shareable, e.g. `jenit-substack`. Follows the name; old ids redirect to the current one. */
  id: z.string(),
  name: z.string(),
  /** Where content for this profile gets published. */
  siteUrl: z.string().nullable(),
  /** Same-origin URL of the uploaded image, or null (the UI then draws a placeholder). */
  imageUrl: z.string().nullable(),
  /** The current user's role in this profile. */
  role: ProfileRoleSchema,
  members: z.array(ProfileMemberSchema),
})
export type Profile = z.infer<typeof ProfileSchema>

/** Bounds how much one account can store (each profile may hold an image). */
export const MAX_OWNED_PROFILES = 25

export const ProfileInputSchema = z.object({ name: NameSchema, siteUrl: SiteUrlSchema.nullish() })
export type ProfileInput = z.infer<typeof ProfileInputSchema>
/** Omitted fields are left alone; `siteUrl: null` clears it. */
export const ProfileUpdateSchema = z.object({
  name: NameSchema.optional(),
  siteUrl: SiteUrlSchema.nullable().optional(),
})
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>

// ---- Invitations (how people join a shared profile) ---------------------

export const InviteInputSchema = z.object({ email: EmailSchema })

/** A pending invitation, as the profile's owner sees it. */
export const InvitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  expiresAt: z.string(),
})
export type Invitation = z.infer<typeof InvitationSchema>

/** What someone holding an invitation link may see before deciding to accept. */
export const InvitationPreviewSchema = z.object({
  profileName: z.string(),
  inviterName: z.string(),
  /** The address the invitation was sent to; the invitee must use an account with this email. */
  email: z.string(),
})
export type InvitationPreview = z.infer<typeof InvitationPreviewSchema>

export const InvitationTokenInputSchema = z.object({ token: z.string().min(1).max(200) })
export const AcceptInvitationResultSchema = z.object({ profileId: z.string() })

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
