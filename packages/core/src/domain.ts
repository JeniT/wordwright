import { z } from 'zod'
import { HANDLE_MAX, HANDLE_MIN, HANDLE_PATTERN, RESERVED_HANDLES } from './ids'
import { REPHRASE } from './rephrase'
import { WebAddressSchema, withScheme } from './web-address'

// ---- Shared field rules -------------------------------------------------

/** Character ceilings that keep a request a sensible size; the word rules in `REPHRASE` are the real limits. */
const REPHRASE_TEXT_MAX = 3000
const REPHRASE_AIM_MAX = 1000

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
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use 128 characters or fewer for the password')
export const NameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name')
  .max(100, 'Use 100 characters or fewer for the name')
export const ChangeNameInputSchema = z.object({ name: NameSchema })
export type ChangeNameInput = z.infer<typeof ChangeNameInputSchema>
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
      .regex(HANDLE_PATTERN, 'Use only letters and numbers in your username')
      .refine((handle) => !RESERVED_HANDLES.has(handle), 'That username is reserved. Try another.'),
  )
export const ChangeHandleInputSchema = z.object({ handle: UsernameInputSchema })
export type ChangeHandleInput = z.infer<typeof ChangeHandleInputSchema>

/** A publication's website: a plausible web address (see `WebAddressSchema`), kept short. */
export const SiteUrlSchema = z
  .string()
  .trim()
  .max(300, 'That web address is too long')
  .pipe(WebAddressSchema)

// ---- Accounts -----------------------------------------------------------

export const UserSchema = z.object({
  id: z.string(),
  /** Short, unique, lower-case name that prefixes the ids of publications this person creates. */
  handle: HandleSchema.nullable(),
  /** A reviewer-only account (#157): reaches only the reviews it was invited to, and has no username or publication yet. */
  reviewerOnly: z.boolean(),
  /** False for a username we generated (sign-up through an identity provider) until the person answers. */
  handleChosen: z.boolean(),
  name: z.string(),
  email: z.string(),
  /** Whether we've confirmed the person controls this address. */
  emailVerified: z.boolean(),
  /** Has a local (email + password) credential. */
  hasPassword: z.boolean(),
  /** External identity providers linked to the account, e.g. ["google"]. */
  linkedProviders: z.array(z.string()),
  /** Whether tutorial mode is on (#198). Always false for a reviewer-only account. */
  tutorialMode: z.boolean(),
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

/** One place the person is signed in. Only a coarse label and a time are kept (no IP address, no location). */
export const SignedInDeviceSchema = z.object({
  id: z.string(),
  /** "Safari on macOS", or "Unknown device". */
  deviceLabel: z.string(),
  lastUsedAt: z.string(),
  /** The session making this request: it is ended with "Sign out", not from this list. */
  current: z.boolean(),
})
export type SignedInDevice = z.infer<typeof SignedInDeviceSchema>

export const SignedInDevicesSchema = z.array(SignedInDeviceSchema)

/** How many other devices "Sign out everywhere else" ended. */
export const SignedOutOthersSchema = z.object({ count: z.number().int().min(0) })
export type SignedOutOthers = z.infer<typeof SignedOutOthersSchema>

/** Changing the email address re-checks the password, like changing the password does. */
export const ChangeEmailInputSchema = z.object({
  newEmail: EmailSchema,
  password: z.string().min(1, 'Enter your password').max(128, 'That password is too long'),
})
export type ChangeEmailInput = z.infer<typeof ChangeEmailInputSchema>

/** Deleting an account needs the password (the account's email is on the page, so typing it proves nothing). */
export const DeleteAccountInputSchema = z.object({
  password: z.string().max(128, 'That password is too long').optional(),
  /** Leave the display name on notes and messages in publications that continue (otherwise "a former member"). */
  keepName: z.boolean().default(true),
})

export const AuthConfigSchema = z.object({
  providers: z.array(z.object({ id: z.string(), label: z.string() })),
})
export type AuthConfig = z.infer<typeof AuthConfigSchema>

// ---- Publications -----------------------------------------------------------

export const PublicationRoleSchema = z.enum(['owner', 'member'])
export type PublicationRole = z.infer<typeof PublicationRoleSchema>

export const PublicationMemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  /** Their username, which is what other members see; their address stays private to them. */
  handle: HandleSchema.nullable(),
  role: PublicationRoleSchema,
})
export type PublicationMember = z.infer<typeof PublicationMemberSchema>

/** An owner makes a member an owner, or an owner a member. */
export const MemberRoleInputSchema = z.object({ role: PublicationRoleSchema })
export type MemberRoleInput = z.infer<typeof MemberRoleInputSchema>

/** Long enough for a few paragraphs about the publication; short enough to put in every prompt. */
export const PUBLICATION_DESCRIPTION_MAX = 5000

export const PublicationSchema = z.object({
  /** Human-readable and shareable, e.g. `jenit-substack`. Follows the name; old ids redirect to the current one. */
  id: z.string(),
  name: z.string(),
  /** Where content for this publication gets published. */
  siteUrl: z.string().nullable(),
  /** Same-origin URL of the uploaded image, or null (the UI then draws a placeholder). */
  imageUrl: z.string().nullable(),
  /**
   * Same-origin URL of the icon of the publication's website, or null. It is another site's image, so the UI shows it as a
   * guest (`PublicationImage kind="source"`), and only when there is no uploaded picture.
   */
  siteIconUrl: z.string().nullable(),
  /** The site icon is square to its corners, so it can fill the picture's box instead of sitting on the plate (#226). */
  siteIconSquare: z.boolean().default(false),
  /**
   * What the publication is, who reads it and what kinds of writing go there, in Markdown, in the writer's own words. It is
   * context for the AI and shown on the publication page. Null when nobody has written one.
   */
  description: z.string().nullable(),
  /** The current user's role in this publication. */
  role: PublicationRoleSchema,
  members: z.array(PublicationMemberSchema),
})
export type Publication = z.infer<typeof PublicationSchema>

/** Bounds how much one account can store (each publication may hold an image). */
export const MAX_OWNED_PUBLICATIONS = 25

export const PublicationInputSchema = z.object({
  name: NameSchema,
  siteUrl: SiteUrlSchema.nullish(),
})
export type PublicationInput = z.infer<typeof PublicationInputSchema>
/**
 * A look at what a website's icon would be, before anything is saved (#224). The icon comes back as a data URL, for
 * showing only: creating or updating a publication fetches it again, so what is stored never comes from the client.
 */
export const SiteIconPreviewInputSchema = z.object({ siteUrl: SiteUrlSchema })
export type SiteIconPreviewInput = z.infer<typeof SiteIconPreviewInputSchema>
export const SiteIconPreviewSchema = z.object({
  iconUrl: z.string().nullable(),
  /** Square to its corners, so it would fill the picture's box (#226). */
  square: z.boolean(),
})
export type SiteIconPreview = z.infer<typeof SiteIconPreviewSchema>
/** Omitted fields are left alone; `siteUrl: null` clears it. */
export const PublicationUpdateSchema = z.object({
  name: NameSchema.optional(),
  siteUrl: SiteUrlSchema.nullable().optional(),
})
export type PublicationUpdate = z.infer<typeof PublicationUpdateSchema>

/** Blank text clears the description. Only a person's own words come through here; drafts have their own route. */
export const PublicationDescriptionInputSchema = z.object({
  description: z
    .string()
    .max(
      PUBLICATION_DESCRIPTION_MAX,
      `Keep the description under ${PUBLICATION_DESCRIPTION_MAX} characters, or shorten it`,
    )
    .nullable()
    .transform((text) => (text?.trim() ? text.trim() : null)),
})
export type PublicationDescriptionInput = z.input<typeof PublicationDescriptionInputSchema>

// ---- Idea sources (feeds scanned for articles that could spark ideas) ---

/** Bounds how much one publication can store, and how many feeds a later scan has to fetch. */
export const MAX_SOURCES_PER_PUBLICATION = 50

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

/**
 * One post in a feed: what the feed itself gives, never the article. The summary is plain text and
 * short (feeds often carry the whole article; we keep only the start).
 */
export const FeedItemSchema = z.object({
  /** Stable across reads: the feed's own id for the post, else its address. */
  id: z.string(),
  title: z.string(),
  url: z.string(),
  summary: z.string().nullable(),
  authors: z.array(z.string()),
  /** ISO time, or null when the feed gives none we can read. */
  publishedAt: z.string().nullable(),
})
export type FeedItem = z.infer<typeof FeedItemSchema>

/** The most items kept from one feed. */
export const MAX_FEED_ITEMS = 50

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
  /** The picture is square to its corners, so it can fill its box instead of sitting on the plate (#226). */
  iconSquare: z.boolean().default(false),
  /** When we last managed to read the feed's posts; null if never. */
  lastWorkedAt: z.string().nullable().default(null),
  /** Why the latest attempt to read it failed, in words for the person; null if it didn't. */
  lastError: z.string().nullable().default(null),
})
export type Source = z.infer<typeof SourceSchema>

/** A feed's recent posts as we last read them (see `docs/decisions.md`: we cache, and read politely). */
export const SourceItemsSchema = z.object({
  items: z.array(FeedItemSchema),
  /** When the feed was last asked; null if never. */
  checkedAt: z.string().nullable(),
  lastWorkedAt: z.string().nullable(),
  lastError: z.string().nullable(),
})
export type SourceItems = z.infer<typeof SourceItemsSchema>

/** The publication's feeds, in the order they were added. */
export const SourceListSchema = z.array(SourceSchema)

export const SourceInputSchema = z.object({ url: FeedUrlSchema })
export type SourceInput = z.infer<typeof SourceInputSchema>

/**
 * What adding a website can answer instead of a source: the website offers several feeds, and the
 * person chooses. Nothing has been added yet.
 */
export const SourceChoicesSchema = z.object({
  choices: z.array(
    z.object({
      url: z.string(),
      /** What the website calls this feed; null when it doesn't say. */
      title: z.string().nullable(),
      /** A feed of comments rather than of posts. */
      comments: z.boolean(),
      /** Already in this publication's list. */
      alreadyAdded: z.boolean(),
    }),
  ),
})
export type SourceChoices = z.infer<typeof SourceChoicesSchema>

/** How far back the publication's recent posts reach, in days. */
export const RECENT_DAYS_DEFAULT = 30
export const RECENT_DAYS_MAX = 365
/** The most posts one recent-posts answer carries. */
export const MAX_RECENT_POSTS = 100

/**
 * What has become of a post: `added` to a reading list (here, or by hand: it is on one), `ignored` by someone in
 * the publication, or still `new`. A decision is shared by everyone in the publication and is about the post's address, so
 * the same post carried by two feeds is one decision.
 */
export const PostStatusSchema = z.enum(['new', 'added', 'ignored'])
export type PostStatus = z.infer<typeof PostStatusSchema>

/** One post from any of the publication's feeds, with the feed it came from. */
export const RecentPostSchema = FeedItemSchema.extend({
  sourceId: z.string(),
  status: PostStatusSchema.default('new'),
})
export type RecentPost = z.infer<typeof RecentPostSchema>

/**
 * The newest posts across all the publication's feeds, newest first. `publishedAt` is always set here:
 * a post whose date we can't read can't be placed in time, so it is counted in `undated` instead.
 */
export const RecentPostsSchema = z.object({
  days: z.number(),
  posts: z.array(RecentPostSchema),
  /** Posts in the window that were left out because the list is capped. */
  omitted: z.number(),
  /** Posts from the feeds that carry no readable date, so are not in the list. */
  undated: z.number(),
  /** Feeds that couldn't be read just now (their older posts, if kept, are still counted). */
  failed: z.array(z.object({ sourceId: z.string(), error: z.string() })),
})
export type RecentPosts = z.infer<typeof RecentPostsSchema>

/** Posts, named by their feed and their id in it, to add to the reading list, ignore or reconsider. */
export const MAX_POSTS_PER_DECISION = 20
export const PostRefsSchema = z.object({
  posts: z
    .array(z.object({ sourceId: z.string(), postId: z.string() }))
    .min(1, 'Choose at least one post')
    .max(MAX_POSTS_PER_DECISION),
})
export type PostRefs = z.infer<typeof PostRefsSchema>

export const PostDecisionSchema = z.object({
  results: z.array(
    z.object({ sourceId: z.string(), postId: z.string(), status: PostStatusSchema }),
  ),
})
export type PostDecision = z.infer<typeof PostDecisionSchema>

// ---- Invitations (how people join a shared publication) ---------------------

export const InviteInputSchema = z.object({ email: EmailSchema })

/** A pending invitation, as the publication's owner sees it. */
export const InvitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  expiresAt: z.string(),
})
export type Invitation = z.infer<typeof InvitationSchema>

/** What someone holding an invitation link may see before deciding to accept. */
export const InvitationPreviewSchema = z.object({
  publicationName: z.string(),
  inviterName: z.string(),
  /** The address the invitation was sent to; the invitee must use an account with this email. */
  email: z.string(),
})
export type InvitationPreview = z.infer<typeof InvitationPreviewSchema>

/** An invitation waiting for the signed-in person, listed on Home so they needn't find the emailed link. */
export const MyInvitationSchema = z.object({
  id: z.string(),
  publicationName: z.string(),
  inviterName: z.string(),
  expiresAt: z.string(),
})
export type MyInvitation = z.infer<typeof MyInvitationSchema>
/** Declining one of those: optionally also stop invitations from the sender, or from everyone. */
export const DeclineMyInvitationInputSchema = z.object({
  block: z.enum(['none', 'sender', 'all']).default('none'),
})
export type DeclineMyInvitationInput = z.input<typeof DeclineMyInvitationInputSchema>

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

export const AcceptInvitationResultSchema = z.object({ publicationId: z.string() })

// ---- Drafts (each develops an idea in a publication) --------------------------------------

export const DraftSchema = z.object({
  id: z.string(),
  publicationId: z.string(),
  /** The idea this draft develops. */
  ideaId: z.string(),
  title: z.string(),
  /** Markdown source of the piece. */
  body: z.string(),
  /** The one member responsible for the title and body (#154). Only they can save, add notes or ask for a critique. */
  editorId: z.string(),
  /** The editor's current name. */
  editorName: z.string(),
  /** Counts saves; a save says which version it was made from, so a stale one is refused instead of overwriting. */
  version: z.number().int().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Draft = z.infer<typeof DraftSchema>

/** How many active drafts Keep writing shows at first, and how many more "Show more" adds. */
export const ACTIVE_DRAFTS_PAGE = 3
/** The most one request may ask for. */
export const ACTIVE_DRAFTS_MAX = 60
/** A draft saved this recently counts as active, whatever else is true of it. */
export const ACTIVE_DRAFT_DAYS = 30

/** How a draft's review requests stand, totalled across all of them. Closed reviews don't count as asked. */
export const DraftReviewTotalsSchema = z.object({
  /** Reviewers reading, finished, or yet to answer the invitation. */
  asked: z.number().int(),
  ended: z.number().int(),
  /** Reviewers' comments the editor has not resolved. */
  unresolved: z.number().int(),
})
export type DraftReviewTotals = z.infer<typeof DraftReviewTotalsSchema>

/** A draft the person edits that is active, with enough around it to show where it is and to open it (Keep writing, #310). */
export const ActiveDraftSchema = z.object({
  id: z.string(),
  title: z.string(),
  ideaId: z.string(),
  ideaName: z.string(),
  publicationId: z.string(),
  publicationName: z.string(),
  updatedAt: z.string(),
  /** Null when the draft has never been sent for review. */
  review: DraftReviewTotalsSchema.nullable(),
})
export type ActiveDraft = z.infer<typeof ActiveDraftSchema>

export const ActiveDraftsSchema = z.object({
  drafts: z.array(ActiveDraftSchema),
  hasMore: z.boolean(),
})
export type ActiveDrafts = z.infer<typeof ActiveDraftsSchema>

export const DraftInputSchema = z.object({
  title: z.string().max(300).default(''),
  body: z.string().default(''),
})
export type DraftInput = z.infer<typeof DraftInputSchema>

/** Saving an existing draft: its words, and the version they were written from. */
export const DraftSaveSchema = DraftInputSchema.extend({ version: z.number().int().min(1) })
export type DraftSave = z.infer<typeof DraftSaveSchema>

// ---- Handing a draft's editor role to someone else (#155) -----------------------------

export const HandoverTargetSchema = z.object({ userId: z.string().min(1) })
export type HandoverTarget = z.infer<typeof HandoverTargetSchema>

export const HANDOVER_KINDS = ['offer', 'ask', 'reassign'] as const
export const HANDOVER_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'withdrawn',
  'dismissed',
  'fulfilled',
  'done',
] as const

/** One line of a draft's handover history. A name is null once that person's account is gone. */
export const HandoverEventSchema = z.object({
  id: z.string(),
  kind: z.enum(HANDOVER_KINDS),
  status: z.enum(HANDOVER_STATUSES),
  /** Who offered, asked or reassigned. */
  actorName: z.string().nullable(),
  /** Who was offered the draft, was asked, or became its editor. */
  memberName: z.string().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  /** True for a reassignment the system made because the previous editor left the publication. */
  automatic: z.boolean(),
})
export type HandoverEvent = z.infer<typeof HandoverEventSchema>

export const HandoverStateSchema = z.object({
  editorId: z.string(),
  editorName: z.string(),
  /** The editor's open offer, if any (there is at most one). */
  offer: z
    .object({ id: z.string(), toId: z.string(), toName: z.string(), createdAt: z.string() })
    .nullable(),
  /** Members who have asked the editor for the draft and not been answered. */
  asks: z.array(
    z.object({ id: z.string(), byId: z.string(), byName: z.string(), createdAt: z.string() }),
  ),
  /** Newest first. */
  history: z.array(HandoverEventSchema),
})
export type HandoverState = z.infer<typeof HandoverStateSchema>

// ---- Ideas (belong to a publication; drafts develop them) -------------------

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

/** Who or what put an item on a reading list: the writer, the AI (brainstorm, research), or a post from the publication's feeds. */
export const ReadingOriginSchema = z.enum([
  'entered',
  'brainstorm',
  'research',
  'idea_generation',
  'feed',
])
export type ReadingOrigin = z.infer<typeof ReadingOriginSchema>

/** Who wrote a piece: names as the page or the writer gave them. */
export const MAX_AUTHORS = 10
export const AUTHOR_NAME_MAX = 100
export const AuthorNamesSchema = z
  .array(
    z
      .string()
      .transform((n) => n.trim().replace(/\s+/g, ' '))
      .pipe(
        z
          .string()
          .min(1)
          .max(AUTHOR_NAME_MAX, `Use ${AUTHOR_NAME_MAX} characters or fewer in a name`),
      ),
  )
  .max(MAX_AUTHORS, `A piece can have up to ${MAX_AUTHORS} authors`)

/** An item on an idea's reading list (the stored shape is still called a link). */
export const IdeaLinkSchema = z.object({
  id: z.string(),
  url: z.string(),
  /** What the person called it; empty when they just pasted the address. */
  title: z.string(),
  /** Who wrote it: found on the page when the title was, or entered by the writer. Empty when unknown. */
  authors: z.array(z.string()).default([]),
  /** When the writer marked it read (they may have read it offline); null while unread. */
  readAt: z.string().nullable(),
  origin: ReadingOriginSchema,
  /**
   * Why the AI suggested it, when an AI did: the AI's own claim, kept with the item for the writer to judge and
   * never the writer's words. Null for items the writer added.
   */
  why: z.string().nullish(),
  /**
   * Only on the publication's own reading list: the writer asked for it to be kept. Items that aren't are dropped a
   * month after they were put there (`PUBLICATION_READING_DAYS`). Always false on an idea's list, which isn't swept.
   */
  kept: z.boolean().optional(),
  /** Flat labels the writer has put on it, in the order given: the same rules as a note's (`NoteTagsInputSchema`). */
  tags: z.array(z.string()).default([]),
  /** When it was put on this list (not when it was written): the month before an unkept item drops runs from here. */
  addedAt: z.string().optional(),
})
export type IdeaLink = z.infer<typeof IdeaLinkSchema>

/** How long an item stays on the publication's own reading list unless it is kept. */
export const PUBLICATION_READING_DAYS = 30

/**
 * `title` may be left empty: the server then looks the page's title up. When editing, an empty
 * title means "fetch it again".
 */
export const IdeaLinkInputSchema = z.object({
  url: WebAddressSchema,
  title: z.string().trim().max(200, 'Use 200 characters or fewer for the title').default(''),
  /**
   * Omitted: left as they are (or looked up, for a new item or a changed address). Given: those names. Given as an
   * empty list while the page is being looked up again: looked up, so "re-detect both" works from one form.
   */
  authors: AuthorNamesSchema.optional(),
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
  /** Their name now; null once they have left. */
  authorName: z.string().nullable(),
  /** Labels the writer has put on it (a draft, a section, a theme), in the order they gave them. Flat, not nested. */
  tags: z.array(z.string()),
  /** The reading-list item it was taken from, if any (null once that item is removed). */
  readingItemId: z.string().nullable(),
  /** The writer's copy of someone else's exact words. Its text is never edited, and goes into a draft as a blockquote. */
  quote: z.boolean(),
  /** When it was pulled into a draft; null while it hasn't been. */
  addedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type IdeaNote = z.infer<typeof IdeaNoteSchema>

/** Notes made through the API are the person's own; other origins are set by the server. */
export const IdeaNoteInputSchema = z.object({
  text: NoteTextSchema,
  /** A note taken while reading this item of the idea's reading list: it then has origin `reading`. */
  readingItemId: z.string().optional(),
  /** The text is a direct quotation from that item, kept word for word. It needs `readingItemId`. */
  quote: z.boolean().optional(),
  /** Put the note at the top of the list, not the end (the Note page's own form; everything else goes last). */
  first: z.boolean().optional(),
})

/**
 * Where to move reading items or notes: to an idea, or (`null`) to the publication itself, where they are kept before
 * there is an idea. The publication is the one the request is made to, unless `publicationId` names another that the
 * person belongs to.
 */
export const MoveTargetSchema = z.object({
  ideaId: z.string().nullable(),
  publicationId: z.string().optional(),
})
export type MoveTarget = z.infer<typeof MoveTargetSchema>

export const MoveReadingInputSchema = z.object({
  ids: z.array(z.string()).min(1, 'Choose at least one item').max(MAX_IDEA_LINKS),
  to: MoveTargetSchema,
})
export type MoveReadingInput = z.infer<typeof MoveReadingInputSchema>

export const MoveNotesInputSchema = z.object({
  ids: z.array(z.string()).min(1, 'Choose at least one note').max(MAX_IDEA_NOTES),
  to: MoveTargetSchema,
})
export type MoveNotesInput = z.infer<typeof MoveNotesInputSchema>

/** What a move did, so the page can say it ("Moved 2 items and 5 notes"). */
export const MoveResultSchema = z.object({
  /** Groups everything this one move did; kept in the log of moves. */
  batchId: z.string(),
  /** Reading items that were moved (they left where they were). */
  readingItems: z.number(),
  /** Of those, how many joined an item with the same address that was already there. */
  merged: z.number(),
  /** Reading items copied to where notes went, so that a note keeps the source it was taken from. */
  copied: z.number(),
  notes: z.number(),
})
export type MoveResult = z.infer<typeof MoveResultSchema>

export const MAX_MOVED_IDEAS = 500

/** Moving whole ideas to another publication the person belongs to. */
export const MoveIdeasInputSchema = z.object({
  ids: z.array(z.string()).min(1, 'Choose at least one idea').max(MAX_MOVED_IDEAS),
  to: z.object({ publicationId: z.string() }),
})
export type MoveIdeasInput = z.infer<typeof MoveIdeasInputSchema>

/**
 * What moving the ideas would do, to confirm before doing it. `problem` is the reason it would be refused (in words
 * that say what to do), or null.
 */
export const MoveIdeasPreviewSchema = z.object({
  ideas: z.number(),
  drafts: z.number(),
  notes: z.number(),
  links: z.number(),
  /** Members of the publication they leave who don't belong to the one they go to, so can no longer see them. */
  losingAccess: z.array(z.string()),
  problem: z.string().nullable(),
})
export type MoveIdeasPreview = z.infer<typeof MoveIdeasPreviewSchema>

export const MoveIdeasResultSchema = z.object({
  publicationId: z.string(),
  ideaIds: z.array(z.string()),
})
export type MoveIdeasResult = z.infer<typeof MoveIdeasResultSchema>

export const NOTE_TAG_MAX = 40
export const MAX_NOTE_TAGS = 10

/** One tag: a short label. Spacing is tidied; it is compared ignoring case, so "Intro" and "intro" are one tag. */
export const NoteTagSchema = z
  .string()
  .transform((t) => t.trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(1, 'A tag needs a word or two')
      .max(NOTE_TAG_MAX, `Use ${NOTE_TAG_MAX} characters or fewer in a tag`),
  )

/** The whole set of tags a note should have; repeats (ignoring case) are dropped, keeping the first. */
export const NoteTagsInputSchema = z.object({
  tags: z
    .array(NoteTagSchema)
    .transform((tags) => {
      const seen = new Set<string>()
      return tags.filter((t) => !seen.has(t.toLowerCase()) && !!seen.add(t.toLowerCase()))
    })
    .pipe(z.array(z.string()).max(MAX_NOTE_TAGS, `Use ${MAX_NOTE_TAGS} tags or fewer on a note`)),
})
export type NoteTagsInput = z.infer<typeof NoteTagsInputSchema>

/**
 * A bulk change of tags on several notes (or reading items) at once: add some, take some away. Tags are tidied and
 * compared ignoring case, as on one note. At least one of `add` and `remove` must name something.
 */
const TagListSchema = z.array(NoteTagSchema).transform((tags) => {
  const seen = new Set<string>()
  return tags.filter((t) => !seen.has(t.toLowerCase()) && !!seen.add(t.toLowerCase()))
})
export const BulkTagInputSchema = z
  .object({
    ids: z
      .array(z.string())
      .min(1, 'Choose at least one to tag')
      .max(MAX_IDEA_NOTES, `Choose up to ${MAX_IDEA_NOTES} at a time`),
    add: TagListSchema.default([]),
    remove: TagListSchema.default([]),
  })
  .refine((v) => v.add.length + v.remove.length > 0, 'Give a tag to add or to remove')
export type BulkTagInput = z.infer<typeof BulkTagInputSchema>

/** Which notes to join into one. They need not be next to each other; the result takes the first one's place. */
export const NoteMergeInputSchema = z.object({
  ids: z
    .array(z.string())
    .min(2, 'Choose at least two notes to merge')
    .max(MAX_IDEA_NOTES, `An idea can have up to ${MAX_IDEA_NOTES} notes`),
})
export type NoteMergeInput = z.infer<typeof NoteMergeInputSchema>

const SPLIT_PART = 'Put the cursor inside the note, with some words on each side of it'
/** The two notes a note becomes. They are the writer's own text, so they may differ from the note's text as saved. */
export const NoteSplitInputSchema = z.object({
  before: z.string().trim().min(1, SPLIT_PART).max(NOTE_TEXT_MAX),
  after: z.string().trim().min(1, SPLIT_PART).max(NOTE_TEXT_MAX),
})
export type NoteSplitInput = z.infer<typeof NoteSplitInputSchema>

/** Changing a note changes only its text; where it came from stays. */
export const IdeaNoteEditSchema = z.object({ text: NoteTextSchema })

/** Puts a note back among those that can be pulled into a draft (`added: false`), or sets it aside (`true`). */
export const NoteAddedSchema = z.object({ added: z.boolean() })
export type NoteAdded = z.infer<typeof NoteAddedSchema>

/** Marks a reading-list item read, or unread again. */
export const ReadingItemReadSchema = z.object({ read: z.boolean() })
export const ReadingItemKeptSchema = z.object({ kept: z.boolean() })
export type ReadingItemRead = z.infer<typeof ReadingItemReadSchema>
export type IdeaNoteInput = z.infer<typeof IdeaNoteInputSchema>

/** Every note id of the idea, in the new order. Must name exactly the notes it has. */
export const IdeaNoteOrderSchema = z.object({ ids: z.array(z.string()).max(MAX_IDEA_NOTES) })
export type IdeaNoteOrder = z.infer<typeof IdeaNoteOrderSchema>

// ---- Words pulled into a draft from the idea's notes ---------------------
// The origin follows the text (docs/responsible-ai.md, principle 5): a passage inserted from a note keeps saying who
// the note came from and how, even after it is edited, instead of becoming anonymous prose.

/** The writer says: this note's text was put into this draft. Origin and source are taken from the note by the server. */
export const DraftInsertionInputSchema = z.object({
  noteId: z.string(),
  /** Exactly what was inserted (Markdown, with the source link if there was one). */
  text: z
    .string()
    .trim()
    .min(1)
    .max(NOTE_TEXT_MAX + 1000),
})
export type DraftInsertionInput = z.infer<typeof DraftInsertionInputSchema>

/** Where words in a draft came from: a note's origin, or `option` for an AI option the writer picked (Rephrase). */
export const InsertionOriginSchema = z.enum([...NoteOriginSchema.options, 'option'])
export type InsertionOrigin = z.infer<typeof InsertionOriginSchema>

/**
 * The writer says: I used this option from a Rephrase window. `offered` is the option as the AI gave it and `text` the
 * words as they went into the draft (perhaps edited). The server cannot check what was offered, because it keeps
 * nothing between rounds, so this is the writer's report; the record is for honesty about origin, not for proof.
 */
export const OptionUseInputSchema = z.object({
  kind: z.enum(['title', 'passage']),
  offered: z.string().trim().min(1).max(REPHRASE_TEXT_MAX),
  text: z.string().trim().min(1).max(REPHRASE_TEXT_MAX),
  aim: z.string().trim().min(1).max(REPHRASE_AIM_MAX),
})
export type OptionUseInput = z.infer<typeof OptionUseInputSchema>

export const DraftInsertionSchema = z.object({
  id: z.string(),
  text: z.string(),
  origin: InsertionOriginSchema,
  /** For `origin: 'option'` only: what the AI offered, what the writer asked for, and where it went. */
  option: z
    .object({ kind: z.enum(['title', 'passage']), offered: z.string(), aim: z.string() })
    .optional(),
  /** Who the note was by when it was inserted (their name now); null once they have left. */
  /** Who that was, so the viewer can be told "your" from "their"; null once they have left. */
  noteAuthorId: z.string().nullable(),
  noteAuthorName: z.string().nullable(),
  insertedByName: z.string().nullable(),
  insertedAt: z.string(),
  /** The reading-list item the note was taken from, as it was then. */
  source: z
    .object({ title: z.string(), url: z.string(), authors: z.array(z.string()).default([]) })
    .nullable(),
})
export type DraftInsertion = z.infer<typeof DraftInsertionSchema>

/** A draft as listed under its idea. */
export const IdeaDraftSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.string(),
  /** The member responsible for its words; the list shows it, as editors differ. */
  editorId: z.string(),
  /** The editor's current name. */
  editorName: z.string(),
})
export type IdeaDraft = z.infer<typeof IdeaDraftSchema>

/** Every draft id of an idea, in the new order. Must name exactly the idea's drafts. */
export const DraftOrderSchema = z.object({ ids: z.array(z.string()).max(1000) })
export type DraftOrder = z.infer<typeof DraftOrderSchema>

/** What the list of a publication's ideas shows. */
export const IdeaSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  draftCount: z.number().int(),
  updatedAt: z.string(),
})
export type IdeaSummary = z.infer<typeof IdeaSummarySchema>

export const IdeaSchema = z.object({
  id: z.string(),
  publicationId: z.string(),
  name: z.string(),
  /**
   * The notes as Markdown bullets, one per note (see `notesToMarkdown`). Transitional: the idea page and
   * brainstorm still treat the notes as one text. Writing it back splits the bullets into notes again, and
   * writing text that reads the same changes nothing. Use the `/notes` routes for the real thing.
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
// As the writer talks, the AI suggests the points they make as notes (`suggest_note`), and anything bigger (a new
// title, a new idea, a page to read). Nothing is written until a person adds it (#295; before that, notes were added
// straight away).
// See docs/brainstorming.md.

export const BRAINSTORM_MESSAGE_MAX = 10_000
/** More than this many suggestions in one reply is noise, so the rest are ignored. */
export const MAX_PROPOSALS_PER_REPLY = 5
/** How many Refine conversations an idea can hold: a ceiling on what can be re-run (delete one to make room). */
export const MAX_CONVERSATIONS_PER_IDEA = 5
/** More than this many notes recorded in one reply is the AI running away with it, so the rest are ignored. */
export const MAX_NOTES_PER_REPLY = 6

/** The longest title a conversation can have, whoever gives it. */
export const MAX_CONVERSATION_TITLE = 60
const ConversationTitleSchema = z
  .string()
  .trim()
  .min(1, 'Give the conversation a title')
  .max(MAX_CONVERSATION_TITLE, `Use up to ${MAX_CONVERSATION_TITLE} characters`)

/** What the AI sends to name the conversation it is in, once, on its first reply. Untrusted: always validate. */
export const NameConversationToolInputSchema = z.object({
  title: ConversationTitleSchema.describe(
    'A short label for what this conversation is about, not a claim or a headline',
  ),
})

/** A person renaming a conversation. */
export const ConversationTitleInputSchema = z.object({ title: ConversationTitleSchema })

/** What the AI sends when it suggests a point as a note. Untrusted: always validate. */
export const SuggestNoteToolInputSchema = z.object({
  text: NoteTextSchema.describe("One point the writer made, in the writer's own words"),
})

/** A person editing a suggestion that is still waiting: its note text, or an idea's name and starting notes. */
export const ProposalEditInputSchema = z.object({
  text: NoteTextSchema.optional(),
  name: IdeaNameSchema.optional(),
  notes: z.string().max(10_000).optional(),
})

/** What the AI sends when it suggests changing the idea being discussed. Untrusted: always validate. */
export const UpdateIdeaToolInputSchema = z.object({
  name: IdeaNameSchema.describe('A new title for the idea'),
})

/** What the AI sends when it suggests a separate new idea. Untrusted: always validate. */
export const CreateIdeaToolInputSchema = z.object({
  name: IdeaNameSchema.describe('The title of the new idea'),
  notes: IdeaNotesSchema.describe(
    'Starting notes for the new idea, as Markdown bullets: one point to a bullet',
  ),
})

/** What the AI sends when it suggests a page for the idea's reading list. Untrusted: always validate. */
export const SuggestReadingToolInputSchema = z.object({
  url: WebAddressSchema.describe('The web address of the page'),
  title: z
    .string()
    .trim()
    .max(200)
    .default('')
    .describe('The title of the page, as you know it; the app looks up the real one'),
  why: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe('One sentence on why this page is worth the writer reading, for this idea'),
})

/** More than this many reading suggestions in one reply is the AI running away with it. */
export const MAX_READING_SUGGESTIONS_PER_REPLY = 3

export const ProposalToolSchema = z.enum([
  'update_idea',
  'create_idea',
  'suggest_reading',
  'suggest_note',
])
export type ProposalTool = z.infer<typeof ProposalToolSchema>
export const ProposalStatusSchema = z.enum(['pending', 'accepted', 'dismissed'])
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>

/**
 * What the server found when it looked at a suggested address: `found` (the page has this title), `no-title`
 * (the page exists or couldn't be read, but no title came back), `not-found` (no website by that name) or
 * `not-public` (it points at a private network, which is never contacted). The last two can't be accepted.
 */
export const ReadingCheckSchema = z.enum(['found', 'no-title', 'not-found', 'not-public'])
export type ReadingCheck = z.infer<typeof ReadingCheckSchema>

/** What goes with a suggested reading-list item: what the server found when it looked at the address. */
export const ReadingSuggestionSchema = z.object({
  check: ReadingCheckSchema,
  /** The title the page really has, when it has one. Shown beside the suggested title. */
  fetchedTitle: z.string().nullable(),
  /** Who the page says wrote it, when it says. */
  fetchedAuthors: z.array(z.string()),
})
export type ReadingSuggestion = z.infer<typeof ReadingSuggestionSchema>

/** A suggestion from the AI, awaiting (or having had) a person's decision. */
export const ProposalSchema = z.object({
  id: z.string(),
  tool: ProposalToolSchema,
  /**
   * What is suggested. `notes` on an `update_idea` is only found in threads from before notes were recorded
   * directly. A `suggest_reading` has `url`, `title` and `why`: the AI's own words, unverified.
   */
  input: z.object({
    name: z.string().optional(),
    notes: z.string().optional(),
    /** A `suggest_note`'s text. */
    text: z.string().optional(),
    url: z.string().optional(),
    title: z.string().optional(),
    why: z.string().optional(),
  }),
  /** Only for `suggest_reading`. */
  reading: ReadingSuggestionSchema.nullable(),
  status: ProposalStatusSchema,
  /** Still waiting, but the idea has changed since it was suggested: accepting needs `overwrite`. */
  stale: z.boolean(),
  /** The idea that accepting a `create_idea` suggestion made. */
  createdIdeaId: z.string().nullable(),
  decidedByName: z.string().nullable(),
  decidedAt: z.string().nullable(),
  /** A person has changed what the AI suggested, so it is no longer only the AI's words. */
  edited: z.boolean(),
})
export type Proposal = z.infer<typeof ProposalSchema>

/** A point the AI recorded as a note while replying (or tried to). */
export const RecordedNoteSchema = z.object({
  id: z.string(),
  text: z.string(),
  /** `added`; or not added because the idea already has the point (`duplicate`) or is full (`full`). */
  outcome: z.enum(['added', 'duplicate', 'full']),
  /** It was added, and has since been deleted from the idea's notes. */
  removed: z.boolean(),
})
export type RecordedNote = z.infer<typeof RecordedNoteSchema>

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
  /** Points the AI recorded as notes in this reply. */
  notes: z.array(RecordedNoteSchema),
  createdAt: z.string(),
})
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>

/** One Refine conversation, as listed: when it began and who began it (null if their account has gone). */
export const ConversationSummarySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  startedByName: z.string().nullable(),
  /** Its title, if it has one (the AI's, or what a person renamed it to). */
  title: z.string().nullable(),
  /** The title is the AI's, not yet changed by a person, so it is marked as the AI's. */
  titleByAi: z.boolean(),
})
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>

export const ConversationListSchema = z.object({
  /** Oldest first, so a new one goes at the end. */
  conversations: z.array(ConversationSummarySchema),
})
export type ConversationList = z.infer<typeof ConversationListSchema>

export const ConversationSchema = ConversationSummarySchema.extend({
  messages: z.array(ConversationMessageSchema),
  /** Someone's reply is being written right now (only one at a time per conversation). */
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

/** The server-sent events a reply streams, in order: `message`?, `text`*, `note`* and `proposal`*, then `done` or `error`. */
export const BrainstormEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('message'), message: ConversationMessageSchema }),
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('note'), note: RecordedNoteSchema }),
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

// ---- Research: a search for reading, kept apart from brainstorming ---------------------------------------
// The writer describes the areas to look into; the app writes the rest of the prompt. Each run is saved with what it
// found, as a list to review: the writer ticks the pages to add to the reading list. See docs/decisions.md (T38).

/** The most pages one run brings back. */
export const MAX_RESEARCH_RESULTS = 8
export const RESEARCH_AREAS_MAX = 1000

export const ResearchInputSchema = z.object({
  areas: z
    .string()
    .trim()
    .min(1, 'Describe the areas you want to research')
    .max(RESEARCH_AREAS_MAX, `Use ${RESEARCH_AREAS_MAX} characters or fewer to describe the areas`),
})
export type ResearchInput = z.infer<typeof ResearchInputSchema>

export const ResearchItemStatusSchema = z.enum(['suggested', 'added', 'dismissed'])

/** A page a run found. `why` is the AI's claim, not checked; `check` is what the server found at the address. */
export const ResearchItemSchema = z.object({
  id: z.string(),
  url: z.string(),
  /** The title the search gave it. */
  title: z.string(),
  why: z.string(),
  check: ReadingCheckSchema,
  /** The title the page really has, when the server could read one. */
  fetchedTitle: z.string().nullable(),
  fetchedAuthors: z.array(z.string()),
  status: ResearchItemStatusSchema,
})
export type ResearchItem = z.infer<typeof ResearchItemSchema>

export const ResearchRunSchema = z.object({
  id: z.string(),
  /** What the writer asked to look into, as they wrote it. */
  areas: z.string(),
  /** Whose key paid for it; null if their account has gone. */
  createdByName: z.string().nullable(),
  model: z.string(),
  createdAt: z.string(),
  items: z.array(ResearchItemSchema),
})
export type ResearchRun = z.infer<typeof ResearchRunSchema>
export const ResearchRunsSchema = z.array(ResearchRunSchema)

/** The pages of one run to add to the reading list, or to set aside. */
export const ResearchItemIdsSchema = z.object({
  itemIds: z.array(z.string()).min(1, 'Tick at least one page').max(MAX_RESEARCH_RESULTS),
})

export const CritiqueRequestSchema = z.object({ draftId: z.string() })
export type CritiqueRequest = z.infer<typeof CritiqueRequestSchema>

/** How many points one critique may make (it ranks and stops: see docs/responsible-ai.md). */
export const MAX_CRITIQUE_POINTS = 5

/** What the model is asked to send back. `block` is an id from the draft it was shown (`b3`), or `whole`. */
export const ModelCritiqueSchema = z.object({
  summary: z.string().max(2000),
  ready: z.boolean(),
  points: z.array(
    z.object({
      block: z.string().max(20),
      point: z.string().min(1).max(1500),
      reason: z.string().min(1).max(1500),
    }),
  ),
})

/** One thing the editor would change, most important first. Never replacement text. */
export const CritiquePointSchema = z.object({
  /** `b3`: the paragraph (or heading, list item...) it is about; `whole`: the piece as a whole. */
  block: z.string(),
  /** The start of that block, to show which one it is and to find it again after edits; empty for `whole`. */
  excerpt: z.string(),
  /** The block's `blockHash` when it was critiqued; null for `whole`. */
  hash: z.string().nullable(),
  point: z.string(),
  reason: z.string(),
})
export type CritiquePoint = z.infer<typeof CritiquePointSchema>

export const CritiqueSchema = z.object({
  summary: z.string(),
  /** True when nothing important is left to fix; what remains is taste. */
  ready: z.boolean(),
  points: z.array(CritiquePointSchema),
})
export type Critique = z.infer<typeof CritiqueSchema>

/**
 * A critique as kept with its draft: one round, its summary and whether it found the draft ready. The points it made
 * are comments (`CommentSchema`), kept with the draft like any person's.
 */
export const CritiqueRoundSchema = CritiqueSchema.omit({ points: true }).extend({
  id: z.string(),
  createdAt: z.string(),
})
export type CritiqueRound = z.infer<typeof CritiqueRoundSchema>

/**
 * How many critiques a draft gets (docs/responsible-ai.md, principle 1: an LLM critic always finds something, so
 * rounds are rationed). The default is the owner's to set; each writer may choose their own within these bounds.
 */
export const CRITIQUE_ROUNDS_DEFAULT = 3
export const CRITIQUE_ROUNDS_MIN = 1
export const CRITIQUE_ROUNDS_MAX = 5

/** Kinds of page (route names) a person may have seen; a cap so a client cannot grow the list without end. */
export const TUTORIAL_SEEN_MAX = 100

export const TutorialStateSchema = z.object({
  on: z.boolean(),
  /** Route names of the pages with tutorial text the person has visited with tutorial mode on. */
  seen: z.array(z.string()),
  /** The offer to turn tutorial mode off has been answered (either way), so it is never shown again. */
  answered: z.boolean(),
})
export type TutorialState = z.infer<typeof TutorialStateSchema>

export const TutorialUpdateSchema = z.object({
  on: z.boolean().optional(),
  answered: z.boolean().optional(),
})
export type TutorialUpdate = z.infer<typeof TutorialUpdateSchema>

export const TutorialSeenInputSchema = z.object({
  kind: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
})
export type TutorialSeenInput = z.infer<typeof TutorialSeenInputSchema>

export const CritiqueSettingsSchema = z.object({
  /** Critiques a draft gets, whoever asks. */
  rounds: z.number().int().min(CRITIQUE_ROUNDS_MIN).max(CRITIQUE_ROUNDS_MAX),
})
export type CritiqueSettings = z.infer<typeof CritiqueSettingsSchema>

/** The latest critique of a draft, and how many of the writer's looks it has used. */
export const CritiqueStateSchema = z.object({
  round: CritiqueRoundSchema.nullable(),
  /** Critiques the draft has had so far. Editing it does not reset this. */
  used: z.number().int().min(0),
  /** How many the person asking is allowed (their setting). */
  allowed: z.number().int().min(CRITIQUE_ROUNDS_MIN),
})
export type CritiqueState = z.infer<typeof CritiqueStateSchema>

// ---- Rephrase: options for a passage or a title -------------------------

/** One round already asked in this Rephrase window: the Aim given and the options it brought back. */
export const RephraseRoundSchema = z.object({
  aim: z.string().max(REPHRASE_AIM_MAX),
  options: z.array(z.string().max(REPHRASE_TEXT_MAX)).max(REPHRASE.short.max),
})
export type RephraseRound = z.infer<typeof RephraseRoundSchema>

/**
 * Asking for options. `wording` is what is in the window's editable field: the selected passage, or the title.
 * `earlier` holds the rounds already asked in this window, so the AI is told what it has offered. Nothing is kept
 * on the server: the window holds the state, and the only record is made when an option is used.
 */
export const RephraseRequestSchema = z.object({
  draftId: z.string(),
  kind: z.enum(['title', 'passage']),
  wording: z.string().max(REPHRASE_TEXT_MAX),
  aim: z.string().max(REPHRASE_AIM_MAX),
  earlier: z.array(RephraseRoundSchema).max(CRITIQUE_ROUNDS_MAX).default([]),
})
export type RephraseRequest = z.infer<typeof RephraseRequestSchema>

/** What the AI sends back, before we check it: untrusted, so only the shape is assumed. */
export const ModelRephraseSchema = z.object({ options: z.array(z.string()) })

/** Options for the wording, and whether it was short (shown as a list) or long (a carousel). */
export const RephraseResultSchema = z.object({
  size: z.enum(['short', 'long']),
  options: z.array(z.string().min(1)),
})
export type RephraseResult = z.infer<typeof RephraseResultSchema>

// ---- Comments on a draft ------------------------------------------------

/** The longest comment a person can write: it is a remark about the writing, not a rewrite of it. */
export const COMMENT_MAX_LENGTH = 2000

/**
 * A remark about one paragraph of a draft, or the draft as a whole, from a member or from the AI's critique. It is
 * words about the writing and never carries replacement text. The editor sees every comment; everyone else sees only
 * their own (independent review: see CONTEXT.md).
 */
export const CommentSchema = z.object({
  id: z.string(),
  /** The AI's critique made this one. */
  byAi: z.boolean(),
  /** The member who wrote it; null for the AI, and for someone whose account has gone. */
  authorId: z.string().nullable(),
  /** Their name: still theirs after they leave the publication; null when the AI wrote it, or the account was deleted without keeping it. */
  authorName: z.string().nullable(),
  /** The review it was made in, when a reviewer wrote it about the snapshot they were sent; null otherwise. */
  reviewId: z.string().nullable(),
  /** `b3`: the paragraph (or heading, list item...) it is about; `whole`: the draft as a whole. */
  block: z.string(),
  /** The start of that block, to show which one it is and to find it again after edits; empty for `whole`. */
  excerpt: z.string(),
  /** The block's `blockHash` when it was written; null for `whole`. */
  hash: z.string().nullable(),
  text: z.string(),
  /** Why the AI says so; people write one thing. */
  reason: z.string().nullable(),
  /** The editor set it aside as dealt with: hidden, not deleted. */
  resolved: z.boolean(),
  createdAt: z.string(),
})
export type DraftComment = z.infer<typeof CommentSchema>

/** A member's new comment. The server works out the excerpt and hash from the draft it is about. */
export const CommentInputSchema = z.object({
  block: z.string().min(1).max(20),
  text: z.string().trim().min(1).max(COMMENT_MAX_LENGTH),
})
export type CommentInput = z.infer<typeof CommentInputSchema>

/** Sets a comment aside (it stays on record and the editor can show it again), or brings it back. */
export const CommentResolveSchema = z.object({ resolved: z.boolean() })

// ---- Reviewers (#157) -----------------------------------------------------

/** Open: can comment. Ended: the reviewer pressed End review. Closed: the editor stopped accepting. */
export const REVIEW_STATES = ['open', 'ended', 'closed'] as const
export const ReviewStateSchema = z.enum(REVIEW_STATES)
export type ReviewState = z.infer<typeof ReviewStateSchema>

/** One review as its reviewer lists it: what they were asked to read, by whom, and where it stands. */
export const ReviewSummarySchema = z.object({
  id: z.string(),
  draftTitle: z.string(),
  publicationName: z.string(),
  /** Null once the inviter's account has gone. */
  inviterName: z.string().nullable(),
  state: ReviewStateSchema,
  createdAt: z.string(),
})
export type ReviewSummary = z.infer<typeof ReviewSummarySchema>

/**
 * A review opened: the snapshot of the draft that was shared (not the live draft, ADR 0001), always, whatever the
 * state, and the reviewer's own comments on it, and nothing else.
 */
export const ReviewDetailSchema = ReviewSummarySchema.extend({
  draft: z.object({ title: z.string(), body: z.string() }),
  comments: z.array(CommentSchema),
})
export type ReviewDetail = z.infer<typeof ReviewDetailSchema>

/** What the holder of a review invitation link sees before answering. */
export const ReviewInvitationPreviewSchema = z.object({
  draftTitle: z.string(),
  publicationName: z.string(),
  inviterName: z.string(),
  email: z.string(),
})
export type ReviewInvitationPreview = z.infer<typeof ReviewInvitationPreviewSchema>

/**
 * Sending a draft for review: people to ask by email, and members of the publication. The server freezes the draft's title
 * and body as a snapshot, which is what they all review.
 */
export const SendForReviewInputSchema = z
  .object({
    emails: z.array(EmailSchema).max(20).default([]),
    memberIds: z.array(z.string().min(1)).max(20).default([]),
  })
  .refine((v) => v.emails.length + v.memberIds.length > 0, 'Choose at least one person to ask')
export type SendForReviewInput = z.input<typeof SendForReviewInputSchema>

export const ReviewAcceptedSchema = z.object({ reviewId: z.string() })

/** A new person following a review link makes a reviewer-only account with just a name and password. */
export const ReviewerRegisterInputSchema = z.object({
  token: z.string().min(1).max(200),
  name: NameSchema,
  password: PasswordSchema,
})
export type ReviewerRegisterInput = z.infer<typeof ReviewerRegisterInputSchema>

/** The longest name a review request can be given. */
export const MAX_REVIEW_NAME = 80
/** An editor naming a review request. Blank goes back to the default, the date and time it was sent. */
export const ReviewNameInputSchema = z.object({
  name: z.string().trim().max(MAX_REVIEW_NAME, `Use up to ${MAX_REVIEW_NAME} characters`),
})
export type ReviewNameInput = z.infer<typeof ReviewNameInputSchema>

/**
 * One review request (CONTEXT.md): a snapshot sent for review, and how its reviews stand, for the editor: who is
 * still reading, who has finished, who has been asked and not answered, and what is unanswered.
 */
export const SnapshotReviewsSchema = z.object({
  id: z.string(),
  sentAt: z.string(),
  /** What the editor called it; null until then (the date and time it was sent stands in). */
  name: z.string().nullable(),
  open: z.number().int(),
  ended: z.number().int(),
  closed: z.number().int(),
  /** Invitations to review it that have not been accepted yet. */
  pending: z.number().int(),
  /** Everything reviewers have said about it, resolved or not. */
  comments: z.number().int(),
  /** Reviewers' comments on this snapshot that the editor has not resolved. */
  unresolved: z.number().int(),
})
export type SnapshotReviews = z.infer<typeof SnapshotReviewsSchema>

/** Who has been invited to review a draft, as its editor or an owner sees it. */
export const DraftReviewersSchema = z.object({
  reviewers: z.array(
    z.object({
      id: z.string(),
      /** The review request (snapshot) they were asked to review. */
      snapshotId: z.string(),
      name: z.string(),
      email: z.string(),
      state: ReviewStateSchema,
      /** When the snapshot they review was sent. */
      sentAt: z.string(),
      /** What they have said so far. */
      commentCount: z.number().int(),
    }),
  ),
  pending: z.array(
    z.object({
      id: z.string(),
      snapshotId: z.string().nullable(),
      email: z.string(),
      expiresAt: z.string(),
    }),
  ),
  /** Per snapshot sent, oldest first. */
  snapshots: z.array(SnapshotReviewsSchema),
})
export type DraftReviewers = z.infer<typeof DraftReviewersSchema>

/**
 * What is waiting on this person in a publication, for its landing page: drafts offered to them, their own offers still
 * open, and, for drafts they edit, how the reviews they sent stand. Nothing here is a count shown anywhere else.
 */
export const PublicationAttentionSchema = z.object({
  offered: z.array(
    z.object({ draftId: z.string(), title: z.string(), fromName: z.string().nullable() }),
  ),
  waiting: z.array(
    z.object({ draftId: z.string(), title: z.string(), toName: z.string().nullable() }),
  ),
})
export type PublicationAttention = z.infer<typeof PublicationAttentionSchema>

// ---- Bring-your-own LLM credentials ------------------------------------

export const LLM_PROVIDER_IDS = ['anthropic'] as const
export const LLMProviderIdSchema = z.enum(LLM_PROVIDER_IDS)
export type LLMProviderId = z.infer<typeof LLMProviderIdSchema>

/**
 * Used until the person chooses, if the provider offers it to their key. (The models on offer come from the provider
 * itself, `LLMProvider.listModels`, not from a list kept here.)
 */
export const DEFAULT_LLM_MODEL: Record<LLMProviderId, string> = { anthropic: 'claude-sonnet-5-5' }

export const LlmModelSchema = z.object({ id: z.string(), label: z.string() })
export const LlmModelsSchema = z.object({ models: z.array(LlmModelSchema) })
export type LlmModels = z.infer<typeof LlmModelsSchema>

/** What the client may see. The key itself is write-only. */
export const LlmSettingsSchema = z.object({
  provider: LLMProviderIdSchema,
  model: z.string(),
  hasKey: z.boolean(),
  /** e.g. "…a1b2", enough to recognise which key is stored. */
  keyHint: z.string().nullable(),
})
export type LlmSettings = z.infer<typeof LlmSettingsSchema>

export const LlmSettingsInputSchema = z
  .object({
    provider: LLMProviderIdSchema,
    /** Omit to keep the stored model (or, for a first key, the default if the provider offers it). */
    model: z.string().max(100).optional(),
    /** Omit to keep the stored key and only change the model. */
    apiKey: z
      .string()
      .trim()
      .min(10, 'That API key looks too short. Copy the whole key from your provider')
      .max(500, 'That API key is too long')
      .optional(),
  })
  .refine((v) => v.model !== undefined || v.apiKey !== undefined, {
    message: 'Enter an API key or choose a model',
  })
export type LlmSettingsInput = z.infer<typeof LlmSettingsInputSchema>

/** Everything needed to talk to a model on a user's behalf. Never serialise this. */
export interface LLMConfig {
  provider: LLMProviderId
  apiKey: string
  model: string
}
