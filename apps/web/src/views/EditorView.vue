<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import AiButton from '../components/AiButton.vue'
import CommentsPanel from '../components/CommentsPanel.vue'
import DraftInsertions from '../components/DraftInsertions.vue'
import DraftNotes from '../components/DraftNotes.vue'
import HandoverPanel from '../components/HandoverPanel.vue'
import ReviewersPanel from '../components/ReviewersPanel.vue'
import DraftPublish from '../components/DraftPublish.vue'
import DraftReadingList from '../components/DraftReadingList.vue'
import RephraseDialog from '../components/RephraseDialog.vue'
import RichEditor from '../components/RichEditor.vue'
import { useMarkdownMode } from '../lib/markdown-mode'
import TabPanels from '../components/TabPanels.vue'
import { RouterLink, useRouter } from 'vue-router'
import {
  ONE_PARAGRAPH,
  REPHRASE,
  WHOLE_DRAFT,
  countWords,
  splitBlocks,
  wordingProblem,
  type IdeaLink,
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
  useDraftComments,
  useDraftCritique,
  useResolveComment,
  useIdea,
} from '../lib/queries'
import type { CommentMarkPoint } from '../lib/comment-marks'
import { linkMarkdown, noteMarkdown } from '../lib/note-insert'
import type { TextSelection } from '../lib/text-selection'
import QueryState from '../components/QueryState.vue'

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
let loaded: { title: string; body: string; version: number } | null = null
// Newer words from elsewhere (another tab, a refetch when the window regains focus) fill the fields unless the person
// has typed something not yet saved: that stays, and saving it is then refused (see `conflict`) instead of losing either.
watch(
  () => draft.data.value,
  (d) => {
    if (!d || (loaded && d.version === loaded.version)) return
    if (loaded && (title.value !== loaded.title || body.value !== loaded.body)) return
    title.value = d.title
    body.value = d.body
    loaded = { title: d.title, body: d.body, version: d.version }
  },
  { immediate: true },
)

const save = useMutation({
  mutationFn: () => {
    if (!loaded) throw new Error("The draft isn't ready yet. Try again in a moment.")
    return api.updateDraft(props.publicationId, props.id, {
      title: title.value,
      body: body.value,
      version: loaded.version,
    })
  },
  onSuccess: (saved) => {
    loaded = { title: saved.title, body: saved.body, version: saved.version }
    queryClient.setQueryData(queryKeys.draft(props.publicationId, props.id), saved)
  },
})
/** The draft was saved from somewhere else since this page loaded it: what is typed here is kept, not sent. */
const conflict = computed(
  () => save.error.value instanceof ApiError && save.error.value.status === 409,
)

// ---- pulling notes into the draft
const editor = useTemplateRef<InstanceType<typeof RichEditor>>('editor')
const markdownMode = useMarkdownMode()

// ---- citing something on the reading list: only once it has been read
type UnreadChoice = 'read-now' | 'mark' | 'cancel'
const unreadAsk = ref<{ item: IdeaLink; settle: (choice: UnreadChoice) => void } | null>(null)
const citeNotice = ref('')
const askAboutUnread = (item: IdeaLink) =>
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
 * Whether a link to this reading-list item may go into the draft. A read item may. An unread one asks the writer:
 * read it now (it opens in a new tab, so nothing in this draft is lost, and nothing is inserted), mark it as read
 * (they may have read it somewhere else), or cancel. The writer's say-so is all there is to go on, as with the tick.
 */
async function mayCite(item: IdeaLink): Promise<boolean> {
  citeNotice.value = ''
  if (item.readAt) return true
  const choice = await askAboutUnread(item)
  if (choice === 'cancel') return false
  if (choice === 'read-now') {
    const { href } = router.resolve({
      name: 'reading',
      params: {
        publicationId: props.publicationId,
        id: draft.data.value!.ideaId!,
        linkId: item.id,
      },
    })
    window.open(href, '_blank', 'noopener')
    citeNotice.value = `Opened “${item.title || item.url}” in a new tab. Come back and add it once you have read it.`
    return false
  }
  try {
    const updated = await api.setReadingItemRead(
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

/** Puts a link to a reading-list item in the line being written, if it may be cited, and saves the draft. */
async function insertLink(item: IdeaLink) {
  if (!(await mayCite(item))) return
  if (!editor.value?.insertInlineMarkdown(linkMarkdown(item))) {
    throw new Error("The draft isn't ready yet. Try again in a moment.")
  }
  try {
    await save.mutateAsync()
  } catch {
    throw new Error("We couldn't save the draft. The link is in it above; press Save to keep it.")
  }
}

/**
 * Puts a note's words (and its source link) into the draft, saves the draft, and only then marks the note as added,
 * so a note never disappears from the list unless its words are safely in the draft. A note taken from a reading-list
 * item doesn't ask whether it was read: taking the note, on the item's page, was the reading.
 */
async function insertNote(note: IdeaNote, at?: number) {
  const markdown = noteMarkdown(note, idea.data.value?.links ?? [])
  if (!editor.value?.insertMarkdown(markdown, at)) {
    throw new Error("The draft isn't ready yet. Try again in a moment.")
  }
  try {
    await save.mutateAsync()
  } catch {
    throw new Error(
      "We couldn't save the draft. The words are in it above; press Save to keep them.",
    )
  }
  try {
    await api.addDraftInsertion(props.publicationId, props.id, { noteId: note.id, text: markdown })
  } catch {
    throw new Error("The words are in your draft, but we couldn't mark the note as added.")
  }
}

// A note dragged from the side bar and dropped on the text goes in exactly as the button would put it, at the drop point.
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
    return "Write more first. Options for a title come from what you've written."
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
    await save.mutateAsync()
  } catch {
    rephraseNotice.value =
      "We couldn't save the draft. The words are in it above; press Save to keep them."
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

// Beside the draft on a wide screen the side area (notes, reading list, comments) is always there; on a phone it
// slides in over the page.
const sideTabs = computed(() => [
  { id: 'notes', label: 'Notes' },
  { id: 'reading', label: 'Reading list' },
  { id: 'comments', label: 'Comments', count: openComments.value },
])
const sideTab = ref('notes')
const notesOpen = ref(false)
const openButton = useTemplateRef<HTMLButtonElement>('openButton')
const closeButton = useTemplateRef<HTMLButtonElement>('closeButton')
/** True when the side area is beside the draft rather than a drawer over it (jsdom has no media queries). */
const sideIsBeside = () => window.matchMedia?.('(min-width: 1024px)').matches ?? true
async function openNotes() {
  notesOpen.value = true
  await nextTick()
  closeButton.value?.focus()
}
async function closeNotes() {
  notesOpen.value = false
  await nextTick()
  openButton.value?.focus()
}

// ---- comments: the editor sees everyone's (the AI's critique included) and the others only their own; the server
// decides which. The latest critique's summary and the looks used are the editor's alone.
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
    if (!sideIsBeside()) await openNotes()
  },
})
// A comment is resolved (or not) as soon as the switch is flipped; if that cannot be saved the switch goes back.
const resolveProblem = ref('')
const setResolved = useResolveComment(
  () => props.publicationId,
  () => props.id,
  (err, commentId) => {
    resolveProblem.value = `We couldn't save that: ${errorMessage(err)}`
    commentsPanel.value?.revert(commentId)
  },
)
function resolve(commentId: string, resolved: boolean) {
  resolveProblem.value = ''
  setResolved.mutate({ commentId, resolved })
}
const addComment = useAddComment(
  () => props.publicationId,
  () => props.id,
)
/** The paragraphs a new comment can be about: the draft as saved, because that is what the server finds them in. */
const blocks = computed(() => splitBlocks(draft.data.value?.body ?? ''))
const round = computed(() => lastCritique.data.value?.round)
const looks = computed(() => lastCritique.data.value)
const outOfLooks = computed(() => !!looks.value && looks.value.used >= looks.value.allowed)
/** Comments not yet resolved, as this person sees them: what the tab counts. */
const openComments = computed(() => comments.value.filter((c) => !c.resolved).length)
const commentsPanel = useTemplateRef<InstanceType<typeof CommentsPanel>>('commentsPanel')
const activePointId = ref<string | null>(null)
const located = ref<ReadonlySet<string>>(new Set())
const markPoints = computed<CommentMarkPoint[]>(() =>
  comments.value.flatMap((c, i) =>
    c.block === WHOLE_DRAFT
      ? []
      : [
          {
            id: c.id,
            block: c.block,
            hash: c.hash,
            excerpt: c.excerpt,
            number: i + 1,
            label: `Comment ${i + 1}`,
            byAi: c.byAi,
            hidden: c.resolved, // a resolved comment has no mark in the text, but still finds its paragraph
          },
        ],
  ),
)

/** A mark in the text was pressed: show its comment, opening the side area if it is a drawer. */
async function pickPoint(id: string) {
  activePointId.value = id
  sideTab.value = 'comments'
  if (!sideIsBeside() && !notesOpen.value) await openNotes()
  void commentsPanel.value?.focusPoint(id) // the comment to the top of its area...
  editor.value?.scrollToPoint(id) // ...and its paragraph to the top of the page, side by side
}
/** A comment was pressed: show its paragraph in the draft (a drawer gets out of the way first). */
async function showInDraft(id: string) {
  activePointId.value = id
  void commentsPanel.value?.focusPoint(id, { focus: false })
  if (notesOpen.value) await closeNotes()
  editor.value?.focusPoint(id)
}

/** Busy from the press, through saving the latest text, until the comments (or why not) arrive. */
const requestingCritique = ref(false)
const critiquing = computed(() => requestingCritique.value || critique.isPending.value)
async function requestCritique() {
  requestingCritique.value = true
  try {
    await save.mutateAsync() // critique the latest text
    sideTab.value = 'comments' // so the wait, and the answer, are in view
    critique.mutate()
  } finally {
    requestingCritique.value = false
  }
}
</script>

<template>
  <QueryState :query="draft" what="this draft">
    <div class="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-10">
      <!-- With comments marked in the text, room below the end so that even the last paragraph can scroll to the top. -->
      <article class="min-w-0 max-w-2xl" :class="markPoints.length ? 'pb-[60vh]' : ''">
        <p v-if="draft.data.value?.ideaId" class="mb-4 text-sm">
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
        <p v-if="draft.data.value && !canEdit" class="callout mb-4 text-sm" data-testid="read-only">
          <span class="rounded-full bg-accent-wash px-2 py-0.5 text-xs font-medium text-ink">{{
            draft.data.value.editorName
          }}</span>
          is this draft's editor. You can read it and its notes, but only they can change it. Reload
          the page, or come back to it, to see their latest changes.
        </p>
        <HandoverPanel :publication-id="publicationId" :draft-id="id" />
        <ReviewersPanel
          v-if="draft.data.value"
          :publication-id="publicationId"
          :draft-id="id"
          :editor-id="draft.data.value.editorId"
        />
        <h1 class="sr-only">Drafting “{{ title || 'Untitled' }}”</h1>
        <label class="sr-only" for="title">Title</label>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2" :class="canEdit ? 'mb-2' : 'mb-6'">
          <input
            id="title"
            v-model="title"
            :readonly="!canEdit"
            class="min-w-0 flex-1 basis-64 bg-transparent font-display text-3xl font-semibold outline-none placeholder:text-ink-soft"
            placeholder="Title"
          />
          <button
            v-if="canEdit"
            type="button"
            class="btn btn-outline"
            :disabled="!!titleProblem"
            aria-describedby="title-rephrase-hint"
            @click="openTitleRephrase"
          >
            Rephrase title
          </button>
        </div>
        <p v-if="canEdit" id="title-rephrase-hint" class="mb-6 text-sm text-ink-soft">
          {{ titleProblem ?? 'Rephrase title gives you options for a new title.' }}
        </p>

        <RichEditor
          ref="editor"
          v-model="body"
          v-model:markdown-mode="markdownMode"
          :comment-marks="markPoints"
          :active-point-id="activePointId"
          :editable="canEdit"
          @selection-change="selection = $event"
          @note-drop="onNoteDrop"
          @point-pick="pickPoint"
          @located="located = new Set($event)"
        />
        <p v-if="/\]\(/.test(body)" class="mt-2 text-xs text-ink-soft">
          Ctrl or ⌘ and click a link to open it.
        </p>

        <div class="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button
            v-if="canEdit"
            type="button"
            class="btn btn-primary"
            :disabled="save.isPending.value"
            @click="save.mutate()"
          >
            Save
          </button>
          <AiButton
            v-if="canEdit"
            class="btn btn-outline"
            :busy="critiquing"
            busy-text="Reading your draft…"
            :disabled="outOfLooks"
            :aria-describedby="looks ? 'critique-looks' : undefined"
            @click="requestCritique"
          >
            Critique
          </AiButton>
          <button
            v-if="canEdit"
            type="button"
            class="btn btn-outline"
            :disabled="!!rephraseProblem"
            aria-describedby="rephrase-hint"
            @click="openRephrase"
          >
            Rephrase
          </button>
          <button
            v-if="draft.data.value?.ideaId"
            ref="openButton"
            type="button"
            class="btn btn-outline lg:hidden"
            aria-controls="draft-notes"
            :aria-expanded="notesOpen"
            @click="openNotes"
          >
            Notes and comments
          </button>
          <p role="status" class="text-sm text-ink-soft">
            <template v-if="save.isPending.value">Saving…</template>
            <template v-else-if="save.isSuccess.value">Saved</template>
            <template v-else-if="save.isError.value && !conflict">Couldn't save</template>
          </p>
        </div>
        <p v-if="canEdit" id="rephrase-hint" class="mt-2 text-sm text-ink-soft">
          {{ rephraseProblem ?? 'Rephrase gives you options for the words you have selected.' }}
        </p>
        <p v-if="rephraseNotice" role="alert" class="mt-2 text-danger">{{ rephraseNotice }}</p>
        <p v-if="conflict" role="alert" class="mt-3 text-danger">
          This draft was saved somewhere else since you opened it, perhaps in another tab, so this
          save was not made. What you typed is still here: copy it somewhere safe, then reload the
          page to see the latest version.
        </p>
        <p v-if="looks && canEdit" id="critique-looks" class="mt-2 text-sm text-ink-soft">
          <template v-if="outOfLooks">
            You have had your {{ looks.allowed }} {{ looks.allowed === 1 ? 'look' : 'looks' }} at
            this draft. The next step is to
            <RouterLink :to="{ hash: '#publish' }" class="underline">publish it</RouterLink>. You
            can change how many looks a draft gets in your
            <RouterLink to="/account/ai" class="underline">account settings</RouterLink>.
          </template>
          <template v-else>{{ looks.used }} of {{ looks.allowed }} looks used</template>
        </p>

        <DraftInsertions :publication-id="publicationId" :draft-id="id" :body="body" />

        <DraftPublish v-if="canEdit" :title="title" :body="body" />
      </article>

      <div
        v-if="notesOpen"
        class="fixed inset-0 z-30 bg-scrim lg:hidden"
        aria-hidden="true"
        @click="closeNotes"
      ></div>
      <aside
        v-if="draft.data.value?.ideaId"
        id="draft-notes"
        data-side-scroll
        aria-labelledby="draft-side-heading"
        class="mt-8 lg:sticky lg:top-4 lg:mt-0 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:mt-0 max-lg:w-[min(22rem,90vw)] max-lg:overflow-y-auto max-lg:bg-sunken max-lg:p-4 max-lg:shadow-xl max-lg:transition-[transform,visibility] motion-reduce:transition-none"
        :class="notesOpen ? '' : 'max-lg:invisible max-lg:translate-x-full'"
        @keydown.esc="notesOpen && closeNotes()"
      >
        <h2 id="draft-side-heading" class="sr-only">Notes, reading list and comments</h2>
        <button
          ref="closeButton"
          type="button"
          class="btn btn-neutral mb-3 lg:hidden"
          @click="closeNotes"
        >
          Close panel
        </button>
        <TabPanels v-model="sideTab" :tabs="sideTabs" label="Beside the draft">
          <template #notes>
            <DraftNotes
              :publication-id="publicationId"
              :idea-id="draft.data.value.ideaId"
              :reading-list="idea.data.value?.links ?? []"
              :insert="insertNote"
              :only-editor="canEdit ? undefined : draft.data.value.editorName"
            />
            <p v-if="dropProblem" role="alert" class="mt-3 text-danger">{{ dropProblem }}</p>
            <p class="sr-only" aria-live="polite">{{ dropNotice }}</p>
            <p v-if="citeNotice" class="mt-3 text-sm text-ink-soft" aria-live="polite">
              {{ citeNotice }}
            </p>
          </template>
          <template #reading>
            <DraftReadingList
              :reading-list="idea.data.value?.links ?? []"
              :insert-link="insertLink"
              :only-editor="canEdit ? undefined : draft.data.value.editorName"
            />
          </template>
          <template #comments>
            <p v-if="markdownMode && canEdit" class="text-sm text-ink-soft">
              Comments cannot be shown while editing Markdown.
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
              :active-id="activePointId"
              :is-editor="canEdit"
              :viewer-id="session.user?.id"
              :editor-name="draft.data.value.editorName"
              :blocks="blocks"
              :add="addComment"
              :resolve-problem="resolveProblem"
              @show="showInDraft"
              @set-resolved="resolve"
            />
          </template>
        </TabPanels>
      </aside>

      <RephraseDialog
        :open="!!rephrasing"
        :kind="rephrasing?.kind ?? 'passage'"
        :wording="rephrasing?.text ?? ''"
        :mixed-formatting="rephrasing?.kind === 'passage' && rephrasing.mixed"
        :publication-id="publicationId"
        :draft-id="id"
        :rounds="looks?.allowed"
        :prepare="() => save.mutateAsync()"
        @cancel="rephrasing = null"
        @use="useRephrased"
      />

      <ConfirmDialog
        :open="!!unreadAsk"
        title="You haven't marked this as read"
        confirm-label="Mark as read"
        confirm-tone="primary"
        alternate-label="Read it now"
        @confirm="unreadAsk?.settle('mark')"
        @alternate="unreadAsk?.settle('read-now')"
        @cancel="unreadAsk?.settle('cancel')"
      >
        “{{ unreadAsk?.item.title || unreadAsk?.item.url }}” is on your reading list, but you
        haven't marked it as read. Read it before you link to it. If you have already read it,
        perhaps somewhere else, mark it as read.
      </ConfirmDialog>
    </div>
  </QueryState>
</template>
