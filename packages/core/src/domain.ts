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
