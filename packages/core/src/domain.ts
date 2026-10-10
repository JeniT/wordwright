import { z } from 'zod'
import { HANDLE_MAX, HANDLE_MIN, HANDLE_PATTERN } from './ids'
import { WebAddressSchema, withScheme } from './web-address'

// ---- Shared field rules -------------------------------------------------

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email('Enter an email address, like name@example.com')
      .max(254, 'That email address is too long'),
  )
/** Max length bounds the cost of hashing attacker-supplied input. */
export const PasswordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use 128 characters or fewer for the password')
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

/** A profile's website: a plausible web address (see `WebAddressSchema`), kept short. */
export const SiteUrlSchema = z
  .string()
  .trim()
  .max(300, 'That web address is too long')
  .pipe(WebAddressSchema)

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
  password: z.string().min(1, 'Enter your password').max(128, 'That password is too long'),
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
  currentPassword: z
    .string()
    .min(1, 'Enter your current password')
    .max(128, 'That password is too long'),
  newPassword: PasswordSchema,
})

/** Changing the email address re-checks the password, like changing the password does. */
export const ChangeEmailInputSchema = z.object({
  newEmail: EmailSchema,
  password: z.string().min(1, 'Enter your password').max(128, 'That password is too long'),
})
export type ChangeEmailInput = z.infer<typeof ChangeEmailInputSchema>

/** Deleting an account needs deliberate confirmation (and the password, if there is one). */
export const DeleteAccountInputSchema = z.object({
  confirmEmail: EmailSchema,
  password: z.string().max(128, 'That password is too long').optional(),
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

// ---- Idea sources (feeds scanned for articles that could spark ideas) ---

/** Bounds how much one profile can store, and how many feeds a later scan has to fetch. */
export const MAX_SOURCES_PER_PROFILE = 50

/** An RSS/Atom address. People paste "example.com/feed"; assume https, and drop any #fragment. */
export const FeedUrlSchema = z
  .string()
  .trim()
  .min(1, 'Paste the web address of an RSS feed')
  .max(500, 'That web address is too long')
  .transform(withScheme)
  .pipe(
    z.url({
      protocol: /^https?$/,
      message: 'Enter the web address of a feed, like https://example.com/feed',
    }),
  )
  .transform((text) => {
    const url = new URL(text)
    url.hash = ''
    return url.href
  })

export const SourceSchema = z.object({
  id: z.string(),
  /** The feed's own address. */
  url: z.string(),
  /** What the feed calls itself; null for sources added before we started reading feeds. */
  title: z.string().nullable(),
  description: z.string().nullable(),
  /** The website the feed belongs to. */
  siteUrl: z.string().nullable(),
  /** Same-origin URL of the picture we kept for it, or null (the UI then draws a placeholder). */
  iconUrl: z.string().nullable(),
})
export type Source = z.infer<typeof SourceSchema>

/** The list in priority order: the first source matters most. */
export const SourceListSchema = z.array(SourceSchema)

export const SourceInputSchema = z.object({ url: FeedUrlSchema })
export type SourceInput = z.infer<typeof SourceInputSchema>

/** Every source id, in the new order. Must name exactly the sources the profile has. */
export const SourceOrderSchema = z.object({ ids: z.array(z.string()).max(MAX_SOURCES_PER_PROFILE) })
export type SourceOrder = z.infer<typeof SourceOrderSchema>

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
/** What happens, besides declining this one invitation. */
export const DeclineInvitationInputSchema = z.object({
  token: z.string().min(1).max(200),
  block: z.enum(['none', 'sender', 'all']).default('none'),
})
export type DeclineInvitationInput = z.input<typeof DeclineInvitationInputSchema>

/** The invitations a person has chosen not to receive at their address. */
export const InvitationBlocksSchema = z.object({
  all: z.boolean(),
  senders: z.array(z.object({ id: z.string(), name: z.string() })),
})
export type InvitationBlocks = z.infer<typeof InvitationBlocksSchema>
export const SetBlockAllInputSchema = z.object({ blocked: z.boolean() })

export const AcceptInvitationResultSchema = z.object({ profileId: z.string() })

// ---- Drafts (each develops an idea in a profile) --------------------------------------

export const DraftSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  /** The idea this draft develops. */
  ideaId: z.string(),
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

// ---- Ideas (belong to a profile; drafts develop them) -------------------

export const IDEA_NAME_MAX = 200
export const IDEA_NOTES_MAX = 20_000
/** Bounds how much one idea can hold. */
export const MAX_IDEA_LINKS = 50

export const IdeaNameSchema = z
  .string()
  .trim()
  .min(1, 'Describe your idea in a few words')
  .max(
    IDEA_NAME_MAX,
    `Use ${IDEA_NAME_MAX} characters or fewer for the idea; put the rest in the notes`,
  )
export const IdeaNotesSchema = z
  .string()
  .max(
    IDEA_NOTES_MAX,
    `Use ${IDEA_NOTES_MAX.toLocaleString('en')} characters or fewer in the notes`,
  )

export const IdeaLinkSchema = z.object({
  id: z.string(),
  url: z.string(),
  /** What the person called it; empty when they just pasted the address. */
  title: z.string(),
})
export type IdeaLink = z.infer<typeof IdeaLinkSchema>

/**
 * `title` may be left empty: the server then looks the page's title up. When editing, an empty
 * title means "fetch it again".
 */
export const IdeaLinkInputSchema = z.object({
  url: WebAddressSchema,
  title: z.string().trim().max(200, 'Use 200 characters or fewer for the title').default(''),
})
export type IdeaLinkInput = z.infer<typeof IdeaLinkInputSchema>

/** Bounds how much one idea can hold. */
export const MAX_IDEA_NOTES = 200
export const NOTE_TEXT_MAX = 20_000

/** Where a note came from: typed by a person, proposed in a brainstorm, or taken while reading. */
export const NoteOriginSchema = z.enum(['entered', 'brainstorm', 'reading'])
export type NoteOrigin = z.infer<typeof NoteOriginSchema>

export const NoteTextSchema = z
  .string()
  .trim()
  .min(1, 'Write something in the note')
  .max(
    NOTE_TEXT_MAX,
    `Use ${NOTE_TEXT_MAX.toLocaleString('en')} characters or fewer in a note; split it into two`,
  )

export const IdeaNoteSchema = z.object({
  id: z.string(),
  text: z.string(),
  origin: NoteOriginSchema,
  /** Who added it; null once that person has left. */
  authorId: z.string().nullable(),
  /** When it was pulled into a draft; null while it hasn't been. */
  addedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type IdeaNote = z.infer<typeof IdeaNoteSchema>

/** Notes made through the API are the person's own; other origins are set by the server. */
export const IdeaNoteInputSchema = z.object({ text: NoteTextSchema })
export type IdeaNoteInput = z.infer<typeof IdeaNoteInputSchema>

/** Every note id of the idea, in the new order. Must name exactly the notes it has. */
export const IdeaNoteOrderSchema = z.object({ ids: z.array(z.string()).max(MAX_IDEA_NOTES) })
export type IdeaNoteOrder = z.infer<typeof IdeaNoteOrderSchema>

/** A draft as listed under its idea. */
export const IdeaDraftSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.string(),
})
export type IdeaDraft = z.infer<typeof IdeaDraftSchema>

/** Every draft id of an idea, in the new order. Must name exactly the idea's drafts. */
export const DraftOrderSchema = z.object({ ids: z.array(z.string()).max(1000) })
export type DraftOrder = z.infer<typeof DraftOrderSchema>

/** What the list of a profile's ideas shows. */
export const IdeaSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  draftCount: z.number().int(),
  updatedAt: z.string(),
})
export type IdeaSummary = z.infer<typeof IdeaSummarySchema>

export const IdeaSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  name: z.string(),
  /**
   * The notes' text, joined by blank lines. Transitional: the idea page and brainstorm still treat the notes
   * as one text; writing it replaces all the notes with one. Use the `/notes` routes for the real thing.
   */
  notes: z.string(),
  links: z.array(IdeaLinkSchema),
  /** In the order the person has set (new drafts go last): for a linked set of posts, the reading order. */
  drafts: z.array(IdeaDraftSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Idea = z.infer<typeof IdeaSchema>

export const IdeaInputSchema = z.object({
  name: IdeaNameSchema,
  notes: IdeaNotesSchema.default(''),
})
export type IdeaInput = z.infer<typeof IdeaInputSchema>
/** Omitted fields are left alone. */
export const IdeaUpdateSchema = z.object({
  name: IdeaNameSchema.optional(),
  notes: IdeaNotesSchema.optional(),
})
export type IdeaUpdate = z.infer<typeof IdeaUpdateSchema>

// ---- Brainstorming: a conversation about an idea ------------------------
// The AI can only *propose* changes (a new title/notes, or a new idea); nothing is written until
// a person accepts. See docs/brainstorming.md.

export const BRAINSTORM_MESSAGE_MAX = 10_000
/** More than this many suggestions in one reply is noise, so the rest are ignored. */
export const MAX_PROPOSALS_PER_REPLY = 5

/** What the AI sends when it suggests changing the idea being discussed. Untrusted: always validate. */
export const UpdateIdeaToolInputSchema = z
  .object({
    name: IdeaNameSchema.optional().describe('A new title for the idea'),
    notes: IdeaNotesSchema.optional().describe(
      "The complete new text of the idea's notes, replacing the current notes",
    ),
  })
  .refine(
    (v) => v.name !== undefined || v.notes !== undefined,
    'Suggest a new title, new notes, or both',
  )

/** What the AI sends when it suggests a separate new idea. Untrusted: always validate. */
export const CreateIdeaToolInputSchema = z.object({
  name: IdeaNameSchema.describe('The title of the new idea'),
  notes: IdeaNotesSchema.describe('Starting notes for the new idea'),
})

export const ProposalToolSchema = z.enum(['update_idea', 'create_idea'])
export type ProposalTool = z.infer<typeof ProposalToolSchema>
export const ProposalStatusSchema = z.enum(['pending', 'accepted', 'dismissed'])
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>

/** A suggestion from the AI, awaiting (or having had) a person's decision. */
export const ProposalSchema = z.object({
  id: z.string(),
  tool: ProposalToolSchema,
  /** What is suggested. For `update_idea`, only the fields that would change. */
  input: z.object({ name: z.string().optional(), notes: z.string().optional() }),
  status: ProposalStatusSchema,
  /** Still waiting, but the idea has changed since it was suggested: accepting needs `overwrite`. */
  stale: z.boolean(),
  /** The idea that accepting a `create_idea` suggestion made. */
  createdIdeaId: z.string().nullable(),
  decidedByName: z.string().nullable(),
  decidedAt: z.string().nullable(),
})
export type Proposal = z.infer<typeof ProposalSchema>

export const ConversationMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  /** `kickoff` is the app's own opening turn, shown as "Brainstorm started" rather than as text. */
  kind: z.enum(['kickoff', 'message']),
  /** What people see: what was typed, or what the AI said. Empty for a kickoff. */
  text: z.string(),
  /** Who sent it (person messages only); null if their account has gone. */
  authorName: z.string().nullable(),
  /** Which model replied (AI messages only). */
  model: z.string().nullable(),
  /** `stopped`: the person pressed Stop part-way through. */
  status: z.enum(['complete', 'stopped']),
  /** `max_tokens`: cut short. `refusal`: the provider declined to answer. */
  stopReason: z.enum(['end', 'max_tokens', 'tool_use', 'refusal']).nullable(),
  proposals: z.array(ProposalSchema),
  createdAt: z.string(),
})
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>

export const ConversationSchema = z.object({
  messages: z.array(ConversationMessageSchema),
  /** Someone's reply is being written right now (only one at a time per idea). */
  replyingNow: z.object({ name: z.string() }).nullable(),
})
export type Conversation = z.infer<typeof ConversationSchema>

/** Exactly one of: say something, start the session, or ask again after a failed reply. */
const MESSAGE_PROBLEM = `Write a message of up to ${BRAINSTORM_MESSAGE_MAX.toLocaleString('en')} characters`
export const SendMessageInputSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, MESSAGE_PROBLEM)
      .max(BRAINSTORM_MESSAGE_MAX, MESSAGE_PROBLEM)
      .optional(),
    start: z.literal(true, MESSAGE_PROBLEM).optional(),
    retry: z.literal(true, MESSAGE_PROBLEM).optional(),
  })
  .refine(
    (v) => [v.text, v.start, v.retry].filter((x) => x !== undefined).length === 1,
    MESSAGE_PROBLEM,
  )
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>

/** Accepting a suggestion made against older text must say so. */
export const AcceptProposalInputSchema = z.object({ overwrite: z.boolean().optional() })

/** The server-sent events a reply streams, in order: `message`?, `text`*, `proposal`*, then `done` or `error`. */
export const BrainstormEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('message'), message: ConversationMessageSchema }),
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('proposal'), proposal: ProposalSchema }),
  /** The finished AI message; null if the reply was stopped before it said anything. */
  z.object({ type: z.literal('done'), message: ConversationMessageSchema.nullable() }),
  z.object({
    type: z.literal('error'),
    code: z.enum(['auth', 'rate_limit', 'provider', 'timeout', 'unknown']),
    message: z.string(),
    retryAfterSeconds: z.number().optional(),
  }),
])
export type BrainstormEvent = z.infer<typeof BrainstormEventSchema>

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
/** What the person's own brainstorming prompt may hold (the app adds its own rules after it). */
export const BRAINSTORM_PROMPT_MAX = 8000

/** The prompt that applies to this person: their own, or the default (`isDefault`). */
export const BrainstormPromptSchema = z.object({ prompt: z.string(), isDefault: z.boolean() })
export type BrainstormPrompt = z.infer<typeof BrainstormPromptSchema>

export const BrainstormPromptInputSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, 'Write a prompt, or reset to the default one')
    .max(
      BRAINSTORM_PROMPT_MAX,
      `Use ${BRAINSTORM_PROMPT_MAX.toLocaleString('en')} characters or fewer in the prompt`,
    ),
})
export type BrainstormPromptInput = z.infer<typeof BrainstormPromptInputSchema>

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
  apiKey: z
    .string()
    .trim()
    .min(10, 'That API key looks too short. Copy the whole key from your provider')
    .max(500, 'That API key is too long')
    .optional(),
})
export type LlmSettingsInput = z.infer<typeof LlmSettingsInputSchema>

/** Everything needed to talk to a model on a user's behalf. Never serialise this. */
export interface LLMConfig {
  provider: LLMProviderId
  apiKey: string
  model: string
}
