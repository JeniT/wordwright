import { z } from 'zod'
import { HANDLE_MAX, HANDLE_MIN, HANDLE_PATTERN, RESERVED_HANDLES } from './ids'
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
  /** Leave the display name on notes and messages in profiles that continue (otherwise "a former member"). */
  keepName: z.boolean().default(true),
})

export const AuthConfigSchema = z.object({
  providers: z.array(z.object({ id: z.string(), label: z.string() })),
})
export type AuthConfig = z.infer<typeof AuthConfigSchema>

// ---- Profiles -----------------------------------------------------------

export const ProfileRoleSchema = z.enum(['owner', 'member'])
export type ProfileRole = z.infer<typeof ProfileRoleSchema>

export const ProfileMemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: ProfileRoleSchema,
})
export type ProfileMember = z.infer<typeof ProfileMemberSchema>

/** Long enough for a few paragraphs about the venue; short enough to put in every prompt. */
export const PROFILE_DESCRIPTION_MAX = 5000

export const ProfileSchema = z.object({
  /** Human-readable and shareable, e.g. `jenit-substack`. Follows the name; old ids redirect to the current one. */
  id: z.string(),
  name: z.string(),
  /** Where content for this profile gets published. */
  siteUrl: z.string().nullable(),
  /** Same-origin URL of the uploaded image, or null (the UI then draws a placeholder). */
  imageUrl: z.string().nullable(),
  /**
   * What the venue is, who reads it and what kinds of writing go there, in Markdown, in the writer's own words. It is
   * context for the AI and shown on the profile page. Null when nobody has written one.
   */
  description: z.string().nullable(),
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

/** Blank text clears the description. Only a person's own words come through here; drafts have their own route. */
export const ProfileDescriptionInputSchema = z.object({
  description: z
    .string()
    .max(
      PROFILE_DESCRIPTION_MAX,
      `Keep the description under ${PROFILE_DESCRIPTION_MAX} characters, or shorten it`,
    )
    .nullable()
    .transform((text) => (text?.trim() ? text.trim() : null)),
})
export type ProfileDescriptionInput = z.input<typeof ProfileDescriptionInputSchema>

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

/** The list in priority order: the first source matters most. */
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
      /** Already in this profile's list. */
      alreadyAdded: z.boolean(),
    }),
  ),
})
export type SourceChoices = z.infer<typeof SourceChoicesSchema>

/** How far back the profile's recent posts reach, in days. */
export const RECENT_DAYS_DEFAULT = 30
export const RECENT_DAYS_MAX = 365
/** The most posts one recent-posts answer carries. */
export const MAX_RECENT_POSTS = 100

/**
 * What has become of a post: `added` to a reading list (here, or by hand: it is on one), `ignored` by someone in
 * the profile, or still `new`. A decision is shared by everyone in the profile and is about the post's address, so
 * the same post carried by two feeds is one decision.
 */
export const PostStatusSchema = z.enum(['new', 'added', 'ignored'])
export type PostStatus = z.infer<typeof PostStatusSchema>

/** One post from any of the profile's feeds, with the feed it came from. */
export const RecentPostSchema = FeedItemSchema.extend({
  sourceId: z.string(),
  status: PostStatusSchema.default('new'),
})
export type RecentPost = z.infer<typeof RecentPostSchema>

/**
 * The newest posts across all the profile's feeds, newest first. `publishedAt` is always set here:
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

export const DraftInputSchema = z.object({
  title: z.string().max(300).default(''),
  body: z.string().default(''),
})
export type DraftInput = z.infer<typeof DraftInputSchema>

/** Saving an existing draft: its words, and the version they were written from. */
export const DraftSaveSchema = DraftInputSchema.extend({ version: z.number().int().min(1) })
export type DraftSave = z.infer<typeof DraftSaveSchema>

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

/** Who or what put an item on a reading list: the writer, the AI (brainstorm, research), or a post from the profile's feeds. */
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
   * Only on the profile's own reading list: the writer asked for it to be kept. Items that aren't are dropped a
   * month after they were put there (`PROFILE_READING_DAYS`). Always false on an idea's list, which isn't swept.
   */
  kept: z.boolean().optional(),
  /** Flat labels the writer has put on it, in the order given: the same rules as a note's (`NoteTagsInputSchema`). */
  tags: z.array(z.string()).default([]),
  /** When it was put on this list (not when it was written): the month before an unkept item drops runs from here. */
  addedAt: z.string().optional(),
})
export type IdeaLink = z.infer<typeof IdeaLinkSchema>

/** How long an item stays on the profile's own reading list unless it is kept. */
export const PROFILE_READING_DAYS = 30

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
})

/**
 * Where to move reading items or notes: to an idea of the same profile, or (`null`) to the profile itself, where
 * they are kept before there is an idea.
 */
export const MoveTargetSchema = z.object({ ideaId: z.string().nullable() })

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

export const DraftInsertionSchema = z.object({
  id: z.string(),
  text: z.string(),
  origin: NoteOriginSchema,
  /** Who the note was by when it was inserted (their name now); null once they have left. */
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
// As the writer talks, the AI records the points they make as notes (`add_note`, applied straight away). Anything
// bigger it can only *propose* (a new title, or a new idea); nothing of that is written until a person accepts.
// See docs/brainstorming.md.

export const BRAINSTORM_MESSAGE_MAX = 10_000
/** More than this many suggestions in one reply is noise, so the rest are ignored. */
export const MAX_PROPOSALS_PER_REPLY = 5
/** More than this many notes recorded in one reply is the AI running away with it, so the rest are ignored. */
export const MAX_NOTES_PER_REPLY = 6

/** What the AI sends when it records a point as a note. Untrusted: always validate. */
export const AddNoteToolInputSchema = z.object({
  text: NoteTextSchema.describe("One point the writer made, in the writer's own words"),
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

export const ProposalToolSchema = z.enum(['update_idea', 'create_idea', 'suggest_reading'])
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

/** A critique as kept with its draft: one round, with each point given an id and whether the writer set it aside. */
export const CritiqueRoundSchema = CritiqueSchema.omit({ points: true }).extend({
  id: z.string(),
  createdAt: z.string(),
  points: z.array(CritiquePointSchema.extend({ id: z.string(), dismissed: z.boolean() })),
})
export type CritiqueRound = z.infer<typeof CritiqueRoundSchema>

/**
 * How many critiques a draft gets (docs/responsible-ai.md, principle 1: an LLM critic always finds something, so
 * rounds are rationed). The default is the owner's to set; each writer may choose their own within these bounds.
 */
export const CRITIQUE_ROUNDS_DEFAULT = 3
export const CRITIQUE_ROUNDS_MIN = 1
export const CRITIQUE_ROUNDS_MAX = 5

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

/** Sets a point aside (it stays on record and can be brought back), or brings it back. */
export const CritiquePointDismissSchema = z.object({ dismissed: z.boolean() })

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
