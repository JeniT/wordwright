<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, onBeforeUnmount, ref, shallowRef, useTemplateRef, watch, watchEffect } from 'vue'
import Explain from '../components/Explain.vue'
import Icon from '../components/Icon.vue'
import SaveStatus from '../components/SaveStatus.vue'
import PersonChip from '../components/PersonChip.vue'
import PublishedChip from '../components/PublishedChip.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import AiButton from '../components/AiButton.vue'
import CommentsPanel from '../components/CommentsPanel.vue'
import DraftNotes from '../components/DraftNotes.vue'
import { useHandover } from '../lib/draft-people'
import DraftActions from '../components/DraftActions.vue'
import ReviewsPanel from '../components/ReviewsPanel.vue'
import HandoverNotices from '../components/HandoverNotices.vue'
import DraftPublish from '../components/DraftPublish.vue'
import DraftArticleList from '../components/DraftArticleList.vue'
import RephraseDialog from '../components/RephraseDialog.vue'
import NewTabLink from '../components/NewTabLink.vue'
import RichEditor from '../components/RichEditor.vue'
import { useAutosave } from '../lib/autosave'
import { sidePanel } from '../lib/panel'
import { useMarkdownMode } from '../lib/markdown-mode'
import TabPanels from '../components/TabPanels.vue'
import { RouterLink, onBeforeRouteLeave, useRouter } from 'vue-router'
import {
  ONE_PARAGRAPH,
  REPHRASE,
  WHOLE_DRAFT,
  blockHash,
  countWords,
  excerptOf,
  splitBlocks,
  wordingProblem,
  type Article,
  type IdeaNote,
} from '@wordwright/core'
import { ApiError, api, errorMessage } from '../lib/api'
import { useSessionStore } from '../stores/session'
import {
  invalidateRoots,
  queryKeys,
  refreshNotesEverywhere,
  useDraft,
  useAddComment,
  useDeleteComment,
  useEditComment,
  useDraftComments,
  useDraftCritique,
  useResolveComment,
  useIdea,
} from '../lib/queries'
import { blockFor } from '../lib/comment-target'
import type { CommentMarkPoint } from '../lib/comment-marks'
import { linkMarkdown, noteMarkdown } from '../lib/note-insert'
import type { TextSelection } from '../lib/text-selection'
import QueryState from '../components/QueryState.vue'
import TitleField from '../components/TitleField.vue'

const props = defineProps<{ publicationId: string; id: string }>()
const queryClient = useQueryClient()
const router = useRouter()

const draft = useDraft(
  () => props.publicationId,
  () => props.id,
)
// Every draft develops an idea, which it links back to.
const idea = useIdea(
  () => props.publicationId,
  () => draft.data.value?.ideaId,
)
const session = useSessionStore()
/** Only the draft's editor changes its words; everyone else reads it (#154). */
const canEdit = computed(() => !!draft.data.value && draft.data.value.editorId === session.user?.id)
const title = ref('')
const body = ref('')
/** What the server had when the fields were last filled or saved: the words, and the version a save is made from. */
const loaded = shallowRef<{ title: string; body: string; version: number } | null>(null)
// Newer words from elsewhere (another tab, a refetch when the window regains focus) fill the fields unless the person
// has typed something not yet saved: that stays, and saving it is then refused (see `conflict`) instead of losing either.
watch(
  () => draft.data.value,
  (d) => {
    if (!d || (loaded.value && d.version === loaded.value.version)) return
    if (loaded.value && (title.value !== loaded.value.title || body.value !== loaded.value.body))
      return
    title.value = d.title
    body.value = d.body
    loaded.value = { title: d.title, body: d.body, version: d.version }
  },
  { immediate: true },
)

const save = useMutation({
  mutationFn: () => {
    if (!loaded.value) throw new Error("The draft isn't ready yet. Try again in a moment.")
    return api.updateDraft(props.publicationId, props.id, {
      title: title.value,
      body: body.value,
      version: loaded.value.version,
    })
  },
  onSuccess: (saved) => {
    loaded.value = { title: saved.title, body: saved.body, version: saved.version }
    queryClient.setQueryData(queryKeys.draft(props.publicationId, props.id), saved)
  },
})

// The editor's words are saved a moment after they stop typing (and before anything that needs them saved), so there is
// no Save button to forget. Only the editor can have words to save.
const autosave = useAutosave({
  watch: () => [title.value, body.value],
  dirty: () =>
    canEdit.value &&
    !!loaded.value &&
    (title.value !== loaded.value.title || body.value !== loaded.value.body),
  save: () => save.mutateAsync(),
  halts: (err) => err instanceof ApiError && err.status === 409,
})
/** The draft was saved from somewhere else since this page loaded it: what is typed here is kept, not sent. */
const conflict = computed(() => autosave.state.value === 'halted')
/** The save line above the toolbar, as `SaveStatus` takes it: the words say what to do next when the save didn't happen. */
const saveLine = computed(() => ({
  mutation: {
    isPending: computed(() => autosave.state.value === 'saving'),
    isSuccess: computed(() => autosave.state.value === 'saved'),
    isError: computed(() => false), // failures are said below the draft, with their button
    error: ref<unknown>(null),
  },
  text: {
    idle: '',
    unsaved: 'Not saved yet',
    saving: '',
    saved: '',
    failed: 'Not saved. Check your connection, then use Try again below the draft.',
    halted: 'Not saved: the draft was changed somewhere else. See below.',
  }[autosave.state.value],
}))
/** Why a save that something else was waiting on didn't happen, with what the person can do about it. */
function notSavedYet(what: string) {
  return new Error(
    conflict.value
      ? `We couldn't save the draft because it was saved somewhere else. ${what} in it above.`
      : `We couldn't save the draft yet. ${what} in it above, and we'll keep trying.`,
  )
}
/** For what is done to the saved draft (a snapshot for review, a hand-off): save first, and say so if that can't be done. */
async function saveFirst() {
  try {
    await autosave.flush()
  } catch {
    throw new Error(
      conflict.value
        ? 'Nothing was done, because the draft was saved somewhere else since you opened it. Copy what you typed somewhere safe, then reload the page.'
        : "Nothing was done, because we couldn't save the draft yet. Your words are still here, and we'll keep trying.",
    )
  }
}
const quietly = () => void autosave.flush().catch(() => undefined)
function onSaveKey(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
  event.preventDefault()
  if (canEdit.value) quietly()
}
// Leaving the page saves first; if that can't be done the person decides, rather than losing words by accident.
onBeforeRouteLeave(async () => {
  try {
    await autosave.flush()
    return true
  } catch {
    return window.confirm('Your latest changes aren’t saved. Leave without saving them?')
  }
})

// ---- pulling notes into the draft
const editor = useTemplateRef<InstanceType<typeof RichEditor>>('editor')
const markdownMode = useMarkdownMode()

// ---- citing something in the articles: only once it has been read
type UnreadChoice = 'read-now' | 'mark' | 'cancel'
const unreadAsk = ref<{ item: Article; settle: (choice: UnreadChoice) => void } | null>(null)
const citeNotice = ref('')
const askAboutUnread = (item: Article) =>
  new Promise<UnreadChoice>((resolve) => {
    unreadAsk.value = {
      item,
      settle: (choice) => {
        unreadAsk.value = null
        resolve(choice)
      },
    }
  })

/**
 * Whether a link to this article may go into the draft. A read item may. An unread one asks the writer:
 * read it now (it opens in a new tab, so nothing in this draft is lost, and nothing is inserted), mark it as read
 * (they may have read it somewhere else), or cancel. The writer's say-so is all there is to go on, as with the tick.
 */
async function mayCite(item: Article): Promise<boolean> {
  citeNotice.value = ''
  if (item.readAt) return true
  const choice = await askAboutUnread(item)
  if (choice === 'cancel') return false
  if (choice === 'read-now') {
    const { href } = router.resolve({
      name: 'article',
      params: {
        publicationId: props.publicationId,
        id: draft.data.value!.ideaId!,
        articleId: item.id,
      },
    })
    window.open(href, '_blank', 'noopener')
    citeNotice.value = `Opened “${item.title || item.url}” in a new tab. Come back and add it once you have read it.`
    return false
  }
  try {
    const updated = await api.setArticleRead(
      props.publicationId,
      draft.data.value!.ideaId!,
      item.id,
      true,
    )
    queryClient.setQueryData(queryKeys.idea(props.publicationId, updated.id), updated)
    await invalidateRoots(queryClient, 'ideas')
  } catch {
    throw new Error("We couldn't mark it as read. Please try again.")
  }
  return true
}

/** Puts a link to an article in the line being written, if it may be cited, and saves the draft. */
async function insertLink(item: Article, at?: number) {
  if (!(await mayCite(item))) return
  if (!editor.value?.insertInlineMarkdown(linkMarkdown(item), at)) {
    throw new Error("The draft isn't ready yet. Try again in a moment.")
  }
  try {
    await autosave.flush()
  } catch {
    throw notSavedYet('The link is')
  }
}

/**
 * Puts a note's words (and its source link) into the draft, saves the draft, and only then marks the note as added,
 * so a note never disappears from the list unless its words are safely in the draft. A note taken from an article
 * item doesn't ask whether it was read: taking the note, on the item's page, was the reading.
 */
async function insertNote(note: IdeaNote, at?: number) {
  const markdown = noteMarkdown(note, idea.data.value?.articles ?? [])
  if (!editor.value?.insertMarkdown(markdown, at)) {
    throw new Error("The draft isn't ready yet. Try again in a moment.")
  }
  try {
    await autosave.flush()
  } catch {
    throw notSavedYet('The words are')
  }
  try {
    await api.addDraftInsertion(props.publicationId, props.id, { noteId: note.id, text: markdown })
  } catch {
    throw new Error("The words are in your draft, but we couldn't mark the note as added.")
  }
}

// A note or article dragged from the side bar and dropped on the text goes in exactly as the button would put
// it, at the drop point.
const dropNotice = ref('')
const dropProblem = ref('')
let dropping = false
async function onNoteDrop(noteId: string, position: number | undefined) {
  if (dropping) return
  const ideaId = draft.data.value?.ideaId
  const note = queryClient
    .getQueryData<IdeaNote[]>(queryKeys.notes(props.publicationId, ideaId))
    ?.find((n) => n.id === noteId)
  dropNotice.value = ''
  dropProblem.value = ''
  if (!note || note.addedAt) {
    dropProblem.value = note
      ? 'That note is already in a draft. Put it back first to add it again.'
      : "We couldn't find that note. Reload the page and try again."
    return
  }
  dropping = true
  try {
    await insertNote(note, position)
    dropNotice.value = 'Added the note to the draft.'
  } catch (err) {
    dropProblem.value = errorMessage(err)
  } finally {
    dropping = false
    await refreshNotesEverywhere(queryClient)
  }
}

async function onArticleDrop(itemId: string, position: number | undefined) {
  if (dropping) return
  const item = idea.data.value?.articles.find((l) => l.id === itemId)
  dropNotice.value = ''
  dropProblem.value = ''
  if (!item) {
    dropProblem.value = "We couldn't find that article. Reload the page and try again."
    return
  }
  dropping = true
  try {
    await insertLink(item, position)
  } catch (err) {
    dropProblem.value = errorMessage(err)
  } finally {
    dropping = false
  }
}

// ---- Rephrase: options for the words selected in the text. The window opens on what is selected when the button is
// pressed; what comes back replaces exactly those words, the draft is saved, and if an option was used that is recorded.
const selection = ref<TextSelection | null>(null)
const rephrasing = ref<
  | { kind: 'passage'; from: number; to: number; text: string; mixed: boolean }
  | { kind: 'title'; text: string }
  | null
>(null)
const rephraseNotice = ref('')
const rephraseProblem = computed(() => {
  const s = selection.value
  if (!s) return 'Select some of your draft to rephrase it.'
  return s.sameBlock ? wordingProblem('passage', s.text) : ONE_PARAGRAPH
})
/** Why Comment or Rephrase did nothing when pressed, said under the toolbar (the buttons stay reachable by keyboard). */
const toolReason = ref('')
const MARKDOWN_REASON =
  'Comment and Rephrase work on the formatted draft. Switch off Edit as Markdown to use them.'
watch([selection, markdownMode], () => (toolReason.value = ''))
function pressRephrase() {
  if (markdownMode.value) {
    toolReason.value = MARKDOWN_REASON
    return
  }
  if (rephraseProblem.value) {
    toolReason.value = rephraseProblem.value
    return
  }
  openRephrase()
}
function openRephrase() {
  const s = selection.value
  if (!s || rephraseProblem.value) return
  rephraseNotice.value = ''
  rephrasing.value = {
    kind: 'passage',
    from: s.from,
    to: s.to,
    text: s.text,
    mixed: !!editor.value?.hasMixedFormatting(s.from, s.to),
  }
}
// The title needs no selection, but needs a draft worth titling: options come from what has been written.
const titleProblem = computed(() => {
  if (countWords(body.value) < REPHRASE.titleMinBodyWords) {
    return `Write at least ${REPHRASE.titleMinBodyWords} words first. Options for a title come from your draft.`
  }
  return wordingProblem('title', title.value)
})
function openTitleRephrase() {
  if (titleProblem.value) return
  rephraseNotice.value = ''
  rephrasing.value = { kind: 'title', text: title.value }
}
async function useRephrased(result: { text: string; offered: string | null; aim: string | null }) {
  const target = rephrasing.value
  rephrasing.value = null
  if (!target) return
  if (target.kind === 'title') {
    title.value = result.text
  } else if (!editor.value?.replaceRange(target.from, target.to, result.text, target.text)) {
    rephraseNotice.value =
      'The draft changed while the window was open, so nothing was replaced. Select the words again to try once more.'
    return
  }
  try {
    await autosave.flush()
  } catch {
    rephraseNotice.value = notSavedYet('The words are').message
    return
  }
  // Words the writer wrote themselves need no record; words that began as an option do.
  if (!result.offered || !result.aim) return
  try {
    await api.addOptionInsertion(props.publicationId, props.id, {
      kind: target.kind,
      offered: result.offered,
      text: result.text,
      aim: result.aim,
    })
    await invalidateRoots(queryClient, 'draft-insertions')
  } catch {
    rephraseNotice.value = "The words are in your draft, but we couldn't record where they began."
  }
}

// Beside the draft on a wide screen the side area (notes, articles, comments) is always there; on a phone it
// slides in over the page.
// Reviews is there for whoever can load reviews (the editor and the owners), even before any are sent: it is where
// the editor sends one.
const { isOwner } = useHandover(
  () => props.publicationId,
  () => props.id,
)
const canSeeReviews = computed(() => canEdit.value || isOwner.value)
const sideTabs = computed(() => [
  { id: 'notes', label: 'Notes' },
  { id: 'articles', label: 'Articles' },
  { id: 'comments', label: 'Comments' },
  ...(canSeeReviews.value ? [{ id: 'reviews', label: 'Reviews' }] : []),
])
const sideTab = ref('notes')
const notesOpen = sidePanel.open
const openButton = useTemplateRef<HTMLButtonElement>('openButton')
const closeButton = useTemplateRef<HTMLButtonElement>('closeButton')
/** True when the side area is beside the draft rather than a drawer over it (jsdom has no media queries). */
const sideIsBeside = () => window.matchMedia?.('(min-width: 1024px)').matches ?? true
/** The in-page button (tablet width) opened it, so focus goes back there, not to the top bar's tab. */
let openedFromPage = false
function openFromPage() {
  openedFromPage = true
  openNotes()
}
function openNotes() {
  notesOpen.value = true
}
function closeNotes() {
  notesOpen.value = false
}
// The panel opens from the in-page button or, on a phone, the top bar's tab: focus goes into the drawer when it opens
// and back to whichever of the two opened it when it closes.
watch(
  notesOpen,
  (open) => {
    const tab = document.querySelector<HTMLElement>('[data-panel-tab]')
    if (open) return closeButton.value?.focus()
    ;(openedFromPage ? openButton.value : (tab ?? openButton.value))?.focus()
    openedFromPage = false
  },
  { flush: 'post' },
)
watchEffect(() => (sidePanel.available.value = !!draft.data.value?.ideaId))
onBeforeUnmount(() => {
  sidePanel.available.value = false
  sidePanel.open.value = false
})

// ---- comments: the editor sees everyone's (the AI's critique included) and the others only their own; the server
// decides which. The latest critique's summary and the critiques used are the editor's alone.
const lastCritique = useDraftCritique(
  () => props.publicationId,
  () => props.id,
  () => canEdit.value,
)
const commentList = useDraftComments(
  () => props.publicationId,
  () => props.id,
)
const comments = computed(() => commentList.data.value ?? [])
const critique = useMutation({
  mutationFn: () => api.critique(props.publicationId, props.id),
  onSuccess: async (state) => {
    queryClient.setQueryData(queryKeys.critique(props.publicationId, props.id), state)
    await invalidateRoots(queryClient, 'comments')
    activePointId.value = null
  },
  // Whatever came back (comments, or why not) is shown, even on a phone where the comments are in the drawer.
  onSettled: async () => {
    sideTab.value = 'comments'
    if (!sideIsBeside()) openNotes()
  },
})
// A comment is resolved (or not) as soon as the switch is flipped; if that cannot be saved the switch goes back.
const resolveProblem = ref('')
const setResolved = useResolveComment(
  () => props.publicationId,
  () => props.id,
  (err, commentId) => {
    resolveProblem.value = `We couldn’t save that: ${errorMessage(err)}`
    commentsPanel.value?.revert(commentId)
  },
)
function resolve(commentId: string, resolved: boolean) {
  resolveProblem.value = ''
  setResolved.mutate({ commentId, resolved })
}
const editComment = useEditComment(
  () => props.publicationId,
  () => props.id,
)
const deleteComment = useDeleteComment(
  () => props.publicationId,
  () => props.id,
)
const addComment = useAddComment(
  () => props.publicationId,
  () => props.id,
)
/** Where the caret last was, so Comment knows whether it is in the draft's words or the title. */
const caretIn = ref<'title' | 'body' | null>(null)
function noteFocus(event: FocusEvent) {
  const el = event.target as HTMLElement
  if (el.id === 'title') caretIn.value = 'title'
  else if (el.closest('.ProseMirror')) caretIn.value = 'body'
}
/** A comment being written: about a paragraph (and perhaps words in it), or null target for a general one. */
let composings = 0
const composing = ref<{
  id: number
  target: { block: string; number: number; quote: string | null } | null
} | null>(null)
async function startComment() {
  if (markdownMode.value) {
    toolReason.value = MARKDOWN_REASON
    return
  }
  toolReason.value = ''
  // The server finds the paragraph in the saved draft, so what is on the page is saved first.
  try {
    await autosave.flush()
  } catch {
    toolReason.value = notSavedYet('Your words are').message
    return
  }
  const at = !canEdit.value || caretIn.value === 'body' ? editor.value?.commentTarget() : null
  const block = at ? blockFor(at, splitBlocks(body.value)) : null
  composing.value = {
    id: ++composings,
    target: at && block ? { block: block.id, number: block.number, quote: at.quote } : null,
  }
  sideTab.value = 'comments'
  if (!sideIsBeside() && !notesOpen.value) openNotes()
  void commentsPanel.value?.focusComposer()
}
const round = computed(() => lastCritique.data.value?.round)
const looks = computed(() => lastCritique.data.value)
const outOfLooks = computed(() => !!looks.value && looks.value.used >= looks.value.allowed)
const commentsPanel = useTemplateRef<InstanceType<typeof CommentsPanel>>('commentsPanel')
const activePointId = ref<string | null>(null)
/** The words of each comment's paragraph as the text has it now; a comment whose paragraph is gone is not in it. */
const paragraphs = ref<Readonly<Record<string, string>>>({})
const located = computed<ReadonlySet<string>>(() => new Set(Object.keys(paragraphs.value)))
/** The paragraph being commented on gets the active edge (and its words their underline) while the comment is written. */
const composingPoint = computed<CommentMarkPoint[]>(() => {
  const target = composing.value?.target
  const block = target && splitBlocks(body.value).find((b) => b.id === target.block)
  if (!target || !block) return []
  return [
    {
      id: 'composing',
      block: block.id,
      hash: blockHash(block.text),
      excerpt: excerptOf(block.text),
      number: 0,
      label: 'Comment being written',
      byAi: false,
      quote: target.quote,
      edge: true,
    },
  ]
})
const markPoints = computed<CommentMarkPoint[]>(() => [
  ...composingPoint.value,
  ...comments.value.flatMap((c, i) =>
    c.block === WHOLE_DRAFT
      ? []
      : [
          {
            id: c.id,
            block: c.block,
            hash: c.hash,
            excerpt: c.excerpt,
            blockText: c.blockText,
            number: i + 1,
            label: `Comment ${i + 1}`,
            byAi: c.byAi,
            quote: c.quote,
            hidden: c.resolved, // a resolved comment has no mark in the text, but still finds its paragraph
          },
        ],
  ),
])

/** A mark in the text was pressed: show its comment, opening the side area if it is a drawer. */
async function pickPoint(id: string) {
  activePointId.value = id
  sideTab.value = 'comments'
  if (!sideIsBeside() && !notesOpen.value) openNotes()
  void commentsPanel.value?.focusPoint(id) // the comment to the top of its area...
  editor.value?.scrollToPoint(id) // ...and its paragraph to the top of the page, side by side
}
/** A comment was pressed: show its paragraph in the draft (a drawer gets out of the way first). */
async function showInDraft(id: string) {
  activePointId.value = id
  void commentsPanel.value?.focusPoint(id, { focus: false })
  if (notesOpen.value) closeNotes()
  editor.value?.focusPoint(id)
}

/** Busy from the press, through saving the latest text, until the comments (or why not) arrive. */
const requestingCritique = ref(false)
const critiquing = computed(() => requestingCritique.value || critique.isPending.value)
async function requestCritique() {
  requestingCritique.value = true
  try {
    await autosave.flush() // critique the latest text
    sideTab.value = 'comments' // so the wait, and the answer, are in view
    critique.mutate()
  } finally {
    requestingCritique.value = false
  }
}
</script>

<template>
  <QueryState :query="draft" what="this draft">
    <div class="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-10">
      <!-- With comments marked in the text, room below the end so that even the last paragraph can scroll to the top. -->
      <article
        class="min-w-0 max-w-2xl"
        :class="markPoints.length ? 'pb-[60vh]' : ''"
        @focusin="noteFocus"
        @focusout="canEdit && quietly()"
        @keydown="onSaveKey"
      >
        <HandoverNotices :publication-id="publicationId" :draft-id="id" />
        <div class="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p v-if="draft.data.value?.ideaId" class="text-sm">
            <RouterLink
              :to="{
                name: 'idea-drafts',
                params: { publicationId: props.publicationId, id: draft.data.value.ideaId },
              }"
              class="underline"
            >
              ← All drafts
            </RouterLink>
          </p>
          <DraftActions :publication-id="publicationId" :draft-id="id" :prepare="saveFirst" />
        </div>
        <p v-if="draft.data.value && !canEdit" class="callout mb-4 text-sm" data-testid="read-only">
          <PersonChip :name="draft.data.value.editorName" />
          is this draft’s editor. You can read it, but only they can change it.
        </p>
        <p
          v-if="draft.data.value?.publishedAt && !canEdit"
          role="status"
          class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
        >
          <PublishedChip :published-at="draft.data.value.publishedAt" />
          <NewTabLink
            v-if="draft.data.value.publishedUrl"
            :href="draft.data.value.publishedUrl"
            class="link"
            >View post</NewTabLink
          >
        </p>
        <h1 class="sr-only">Drafting “{{ title || 'Untitled' }}”</h1>
        <label class="sr-only" for="title">Title</label>
        <div
          class="flex flex-wrap items-center gap-x-3 gap-y-2"
          :class="canEdit && titleProblem ? 'mb-2' : 'mb-6'"
        >
          <TitleField
            id="title"
            v-model="title"
            :readonly="!canEdit"
            class="flex-1 basis-64"
            placeholder="Title"
            @enter="editor?.focusStart()"
          />
          <button
            v-if="canEdit"
            type="button"
            class="btn btn-outline"
            :disabled="!!titleProblem"
            :aria-describedby="titleProblem ? 'title-rephrase-hint' : undefined"
            @click="openTitleRephrase"
          >
            Rephrase title
          </button>
          <Explain v-if="canEdit" label="About rephrasing the title" class="-ml-2">
            You can ask your AI for title options here. The
            <Icon name="ai" class="inline align-text-bottom" /> button in the toolbar also enables
            you to ask your AI for options for rephrasing text you select in your draft.
          </Explain>
        </div>
        <p v-if="canEdit && titleProblem" id="title-rephrase-hint" class="text-sm text-ink-soft">
          {{ titleProblem }}
        </p>

        <RichEditor
          ref="editor"
          v-model="body"
          v-model:markdown-mode="markdownMode"
          :comment-marks="markPoints"
          :active-point-id="activePointId"
          :editable="canEdit"
          :actions="canEdit"
          :comment-bar="!canEdit"
          :rephrase-ready="!rephraseProblem"
          @comment="startComment"
          @rephrase="pressRephrase"
          @selection-change="selection = $event"
          @note-drop="onNoteDrop"
          @article-drop="onArticleDrop"
          @point-pick="pickPoint"
          @located="paragraphs = $event"
        >
          <template v-if="canEdit" #status>
            <SaveStatus
              :mutation="saveLine.mutation"
              saving="Saving…"
              saved="Saved"
              :text="saveLine.text"
            />
          </template>
          <template #toolbar-notes>
            <p role="status" class="text-sm text-ink-soft" :class="toolReason ? 'mt-1' : ''">
              {{ toolReason }}
            </p>
            <p v-if="rephraseNotice" role="alert" class="mt-1 text-sm text-danger">
              {{ rephraseNotice }}
            </p>
          </template>
        </RichEditor>
        <p v-if="/\]\(/.test(body)" class="mt-2 text-sm text-ink-soft">
          Ctrl or ⌘ and click a link to open it.
        </p>
        <p v-if="canEdit" class="mt-2 text-sm text-ink-soft">
          <NewTabLink to="/help/formatting" class="underline">Formatting and shortcuts</NewTabLink>
        </p>

        <!-- Critique is in the Comments tab; this button is for the width where the panel is neither beside nor a tab. -->
        <div
          v-if="draft.data.value?.ideaId"
          class="mt-6 border-t border-line pt-4 max-md:hidden lg:hidden"
        >
          <button
            ref="openButton"
            type="button"
            class="btn btn-outline"
            aria-controls="draft-notes"
            :aria-expanded="notesOpen"
            @click="openFromPage"
          >
            Open panel
          </button>
        </div>
        <div
          v-if="autosave.state.value === 'failed'"
          role="alert"
          class="callout callout-danger mt-3 flex items-start gap-2"
        >
          <Icon name="alert" class="mt-0.5 shrink-0" />
          <div>
            <p>
              Sorry, we couldn’t save that. Your words are still here. Check your connection, then
              try again.
            </p>
            <button type="button" class="btn btn-outline btn-sm mt-2" @click="autosave.retry()">
              Try again
            </button>
          </div>
        </div>
        <div
          v-if="conflict"
          role="alert"
          class="callout callout-danger mt-3 flex items-start gap-2"
        >
          <Icon name="alert" class="mt-0.5 shrink-0" />
          <p>
            This draft was saved somewhere else since you opened it, so this save wasn’t made. Copy
            what you typed somewhere safe, then reload the page.
          </p>
        </div>

        <DraftPublish
          v-if="canEdit && draft.data.value"
          :publication-id="publicationId"
          :draft-id="id"
          :title="title"
          :body="body"
          :published-at="draft.data.value.publishedAt"
          :published-url="draft.data.value.publishedUrl"
        />
      </article>

      <div
        v-if="notesOpen"
        class="fixed inset-x-0 top-(--bar-top,0px) bottom-0 z-30 bg-scrim lg:hidden"
        aria-hidden="true"
        @click="closeNotes"
      ></div>
      <aside
        v-if="draft.data.value?.ideaId"
        id="draft-notes"
        data-side-scroll
        aria-labelledby="draft-side-heading"
        class="mt-8 lg:sticky lg:top-4 lg:mt-0 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto max-lg:fixed max-lg:top-(--bar-top,0px) max-lg:bottom-0 max-lg:right-0 max-lg:z-40 max-lg:mt-0 max-lg:w-[min(22rem,90vw)] max-lg:overflow-y-auto max-lg:bg-sunken max-lg:p-4 max-lg:shadow-xl max-lg:transition-[transform,visibility] motion-reduce:transition-none"
        :class="notesOpen ? '' : 'max-lg:invisible max-lg:translate-x-full'"
        @keydown.esc="notesOpen && closeNotes()"
      >
        <h2 id="draft-side-heading" class="sr-only">Notes, articles, comments and reviews</h2>
        <button
          ref="closeButton"
          type="button"
          class="btn btn-neutral mb-3 lg:hidden"
          @click="closeNotes"
        >
          Close panel
        </button>
        <p v-if="!canEdit" class="mb-3 text-sm text-ink-soft">
          Only {{ draft.data.value.editorName }}, the draft’s editor, can add to the draft.
        </p>
        <TabPanels v-model="sideTab" :tabs="sideTabs" label="Beside the draft">
          <template #notes>
            <DraftNotes
              :publication-id="publicationId"
              :idea-id="draft.data.value.ideaId"
              :article-list="idea.data.value?.articles ?? []"
              :insert="insertNote"
              :can-add="canEdit"
            />
          </template>
          <template #articles>
            <DraftArticleList
              :publication-id="publicationId"
              :idea-id="draft.data.value.ideaId"
              :article-list="idea.data.value?.articles ?? []"
              :insert-link="insertLink"
              :can-add="canEdit"
            />
          </template>
          <template v-if="canSeeReviews" #reviews>
            <ReviewsPanel :publication-id="publicationId" :draft-id="id" :prepare="saveFirst" />
          </template>
          <template #comments>
            <p v-if="markdownMode && canEdit" class="text-sm text-ink-soft">
              Comments are hidden while you edit Markdown. Switch back to see them.
            </p>
            <CommentsPanel
              v-else
              ref="commentsPanel"
              :query="commentList"
              :comments="comments"
              :round="round"
              :pending="critique.isPending.value"
              :error="critique.error.value ?? lastCritique.error.value"
              :located="located"
              :paragraphs="paragraphs"
              :active-id="activePointId"
              :is-editor="canEdit"
              :editor-name="draft.data.value.editorName"
              :composing="composing"
              :add="addComment"
              :me="session.user?.id ?? null"
              :edit="editComment"
              :remove="deleteComment"
              :resolve-problem="resolveProblem"
              @show="showInDraft"
              @set-resolved="resolve"
              @close-composer="composing = null"
              @start-comment="startComment"
            >
              <template #after>
                <div v-if="canEdit" class="mt-6 border-t border-line pt-4">
                  <div class="flex flex-wrap items-center gap-1">
                    <AiButton
                      class="btn btn-outline"
                      :busy="critiquing"
                      busy-text="Reading your draft…"
                      :disabled="outOfLooks"
                      :aria-describedby="looks ? 'critique-looks critique-sent' : 'critique-sent'"
                      @click="requestCritique"
                    >
                      Critique
                    </AiButton>
                    <Explain label="About Critique">
                      If you ask for a critique, your AI will give you comments on how to improve
                      your draft. AI will always find something wrong with your text, so you can
                      only do this a limited number of times for a draft; you can change this limit
                      in your user settings.
                    </Explain>
                  </div>
                  <p id="critique-sent" class="mt-2 text-sm text-ink-soft">
                    Critique will send this publication’s description and this draft’s title and
                    text to your AI. It will not send your notes.
                  </p>
                  <p v-if="looks" id="critique-looks" class="mt-2 text-sm text-ink-soft">
                    <template v-if="outOfLooks">
                      You have used your {{ looks.allowed }}
                      {{ looks.allowed === 1 ? 'critique' : 'critiques' }} of this draft. The next
                      step is to
                      <RouterLink :to="{ hash: '#publish' }" class="underline" @click="closeNotes"
                        >publish it</RouterLink
                      >. Change how many critiques a draft gets in your
                      <RouterLink to="/account/ai" class="underline">account settings</RouterLink>.
                    </template>
                    <template v-else
                      >{{ looks.used }} of {{ looks.allowed }} critiques used</template
                    >
                  </p>
                </div>
              </template>
            </CommentsPanel>
          </template>
        </TabPanels>
        <!-- Outside the tabs: a drop or an unread item can be answered while another tab is showing. -->
        <p v-if="dropProblem" role="alert" class="mt-3 text-danger">{{ dropProblem }}</p>
        <p class="sr-only" aria-live="polite">{{ dropNotice }}</p>
        <p v-if="citeNotice" class="mt-3 text-sm text-ink-soft" aria-live="polite">
          {{ citeNotice }}
        </p>
      </aside>

      <RephraseDialog
        :open="!!rephrasing"
        :kind="rephrasing?.kind ?? 'passage'"
        :wording="rephrasing?.text ?? ''"
        :mixed-formatting="rephrasing?.kind === 'passage' && rephrasing.mixed"
        :publication-id="publicationId"
        :draft-id="id"
        :rounds="looks?.allowed"
        :prepare="() => autosave.flush()"
        @cancel="rephrasing = null"
        @use="useRephrased"
      />

      <ConfirmDialog
        :open="!!unreadAsk"
        title="You haven’t marked this as read"
        confirm-label="Mark as read"
        confirm-tone="primary"
        alternate-label="Read it now"
        @confirm="unreadAsk?.settle('mark')"
        @alternate="unreadAsk?.settle('read-now')"
        @cancel="unreadAsk?.settle('cancel')"
      >
        “{{ unreadAsk?.item.title || unreadAsk?.item.url }}” is in your articles but isn’t marked as
        read. Read it before you link to it, or mark it as read if you already have.
      </ConfirmDialog>
    </div>
  </QueryState>
</template>
