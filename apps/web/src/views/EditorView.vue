<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import CritiquePanel from '../components/CritiquePanel.vue'
import DraftInsertions from '../components/DraftInsertions.vue'
import DraftNotes from '../components/DraftNotes.vue'
import DraftReadingList from '../components/DraftReadingList.vue'
import RichEditor from '../components/RichEditor.vue'
import TabPanels from '../components/TabPanels.vue'
import { RouterLink, useRouter } from 'vue-router'
import type { IdeaLink, IdeaNote } from '@lfwa/core'
import { api, errorMessage } from '../lib/api'
import {
  invalidateRoots,
  queryKeys,
  refreshNotesEverywhere,
  useDraft,
  useIdea,
} from '../lib/queries'
import type { CritiqueMarkPoint } from '../lib/critique-marks'
import { linkMarkdown, noteMarkdown } from '../lib/note-insert'

const props = defineProps<{ profileId: string; id: string }>()
const queryClient = useQueryClient()
const router = useRouter()

const draft = useDraft(
  () => props.profileId,
  () => props.id,
)
// Every draft develops an idea, which it links back to.
const idea = useIdea(
  () => props.profileId,
  () => draft.data.value?.ideaId,
)
const title = ref('')
const body = ref('')
watch(
  () => draft.data.value,
  (d) => {
    if (d) {
      title.value = d.title
      body.value = d.body
    }
  },
  { immediate: true },
)

const save = useMutation({
  mutationFn: () =>
    api.updateDraft(props.profileId, props.id, { title: title.value, body: body.value }),
  onSuccess: (saved) => queryClient.setQueryData(queryKeys.draft(props.profileId, props.id), saved),
})

// ---- pulling notes into the draft
const editor = useTemplateRef<InstanceType<typeof RichEditor>>('editor')

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
      params: { profileId: props.profileId, id: draft.data.value!.ideaId!, linkId: item.id },
    })
    window.open(href, '_blank', 'noopener')
    citeNotice.value = `Opened “${item.title || item.url}” in a new tab. Come back and add it once you have read it.`
    return false
  }
  try {
    const updated = await api.setReadingItemRead(
      props.profileId,
      draft.data.value!.ideaId!,
      item.id,
      true,
    )
    queryClient.setQueryData(queryKeys.idea(props.profileId, updated.id), updated)
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
    await api.addDraftInsertion(props.profileId, props.id, { noteId: note.id, text: markdown })
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
    .getQueryData<IdeaNote[]>(queryKeys.notes(props.profileId, ideaId))
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

// ---- critique: the latest round is kept with the draft, and its points are marked beside their paragraphs
const critiqueKey = ['critique', () => props.profileId, () => props.id] as const
const lastCritique = useQuery({
  queryKey: critiqueKey,
  queryFn: () => api.latestCritique(props.profileId, props.id),
})
const critique = useMutation({
  mutationFn: () => api.critique(props.profileId, props.id),
  onSuccess: (state) => {
    queryClient.setQueryData(['critique', props.profileId, props.id], state)
    activePointId.value = null
  },
  // Whatever came back (comments, or why not) is shown, even on a phone where the comments are in the drawer.
  onSettled: async () => {
    sideTab.value = 'comments'
    if (!sideIsBeside()) await openNotes()
  },
})
// A comment is marked Read (or not) as soon as the switch is flipped; if that cannot be saved the switch goes back.
const readProblem = ref('')
const setRead = useMutation({
  mutationFn: (v: { pointId: string; read: boolean }) =>
    api.setCritiquePointDismissed(props.profileId, props.id, v.pointId, v.read),
  onMutate: () => (readProblem.value = ''),
  onSuccess: (state) => queryClient.setQueryData(['critique', props.profileId, props.id], state),
  onError: (err, v) => {
    readProblem.value = `We couldn't save that: ${errorMessage(err)}`
    critiquePanel.value?.revert(v.pointId)
  },
})
const round = computed(() => lastCritique.data.value?.round)
const looks = computed(() => lastCritique.data.value)
const outOfLooks = computed(() => !!looks.value && looks.value.used >= looks.value.allowed)
/** Comments not yet marked Read: what the tab counts. */
const openComments = computed(() => round.value?.points.filter((p) => !p.dismissed).length ?? 0)
const critiquePanel = useTemplateRef<InstanceType<typeof CritiquePanel>>('critiquePanel')
const activePointId = ref<string | null>(null)
const located = ref<ReadonlySet<string>>(new Set())
const markPoints = computed<CritiqueMarkPoint[]>(() =>
  (round.value?.points ?? []).flatMap((p, i) =>
    p.block === 'whole'
      ? []
      : [
          {
            id: p.id,
            block: p.block,
            hash: p.hash,
            excerpt: p.excerpt,
            number: i + 1,
            label: `Critique point ${i + 1}`,
            hidden: p.dismissed, // a comment marked Read has no mark in the text, but still finds its paragraph
          },
        ],
  ),
)

/** A mark in the text was pressed: show its comment, opening the side area if it is a drawer. */
async function pickPoint(id: string) {
  activePointId.value = id
  sideTab.value = 'comments'
  if (!sideIsBeside() && !notesOpen.value) await openNotes()
  void critiquePanel.value?.focusPoint(id) // the comment to the top of its area...
  editor.value?.scrollToPoint(id) // ...and its paragraph to the top of the page, side by side
}
/** A comment was pressed: show its paragraph in the draft (a drawer gets out of the way first). */
async function showInDraft(id: string) {
  activePointId.value = id
  void critiquePanel.value?.focusPoint(id, { focus: false })
  if (notesOpen.value) await closeNotes()
  editor.value?.focusPoint(id)
}

async function requestCritique() {
  await save.mutateAsync() // critique the latest text
  sideTab.value = 'comments' // so the wait, and the answer, are in view
  critique.mutate()
}
</script>

<template>
  <p v-if="draft.isPending.value">Loading…</p>
  <p v-else-if="draft.isError.value" role="alert" class="text-danger">Couldn't load this draft.</p>
  <div v-else class="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-10">
    <!-- With comments marked in the text, room below the end so that even the last paragraph can scroll to the top. -->
    <article class="min-w-0 max-w-2xl" :class="markPoints.length ? 'pb-[60vh]' : ''">
      <p v-if="draft.data.value?.ideaId" class="mb-4 text-sm">
        <RouterLink
          :to="{
            name: 'idea-drafts',
            params: { profileId: props.profileId, id: draft.data.value.ideaId },
          }"
          class="underline"
        >
          ← All drafts
        </RouterLink>
      </p>
      <h1 class="sr-only">Drafting “{{ title || 'Untitled' }}”</h1>
      <label class="sr-only" for="title">Title</label>
      <input
        id="title"
        v-model="title"
        class="mb-6 w-full bg-transparent font-display text-3xl font-semibold outline-none placeholder:text-ink-soft"
        placeholder="Title"
      />

      <RichEditor
        ref="editor"
        v-model="body"
        :critique-points="markPoints"
        :active-point-id="activePointId"
        @note-drop="onNoteDrop"
        @point-pick="pickPoint"
        @located="located = new Set($event)"
      />
      <p v-if="/\]\(/.test(body)" class="mt-2 text-xs text-ink-soft">
        Ctrl or ⌘ and click a link to open it.
      </p>

      <div class="mt-6 flex items-center gap-3 border-t border-line pt-4">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="save.isPending.value"
          @click="save.mutate()"
        >
          Save
        </button>
        <button
          type="button"
          class="rounded-ctl border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-sunken disabled:opacity-60"
          :disabled="critique.isPending.value || outOfLooks"
          :aria-describedby="looks ? 'critique-looks' : undefined"
          @click="requestCritique"
        >
          Critique
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
          <template v-else-if="save.isError.value">Couldn't save</template>
        </p>
      </div>
      <p v-if="looks" id="critique-looks" class="mt-2 text-sm text-ink-soft">
        <template v-if="outOfLooks">
          You have had your {{ looks.allowed }} {{ looks.allowed === 1 ? 'look' : 'looks' }} at this
          draft. The next step is to
          <RouterLink
            v-if="draft.data.value?.ideaId"
            :to="{
              name: 'idea-publish',
              params: { profileId: props.profileId, id: draft.data.value.ideaId },
            }"
            class="underline"
            >publish it</RouterLink
          ><template v-else>publish it</template>. You can change how many looks a draft gets in
          your <RouterLink to="/account" class="underline">account settings</RouterLink>.
        </template>
        <template v-else>{{ looks.used }} of {{ looks.allowed }} looks used</template>
      </p>

      <DraftInsertions :profile-id="profileId" :draft-id="id" :body="body" />
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
            :profile-id="profileId"
            :idea-id="draft.data.value.ideaId"
            :reading-list="idea.data.value?.links ?? []"
            :insert="insertNote"
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
          />
        </template>
        <template #comments>
          <CritiquePanel
            ref="critiquePanel"
            :pending="critique.isPending.value"
            :error="critique.error.value ?? lastCritique.error.value"
            :round="round"
            :located="located"
            :active-id="activePointId"
            :read-problem="readProblem"
            @show="showInDraft"
            @set-read="(pointId, read) => setRead.mutate({ pointId, read })"
          />
        </template>
      </TabPanels>
    </aside>

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
      “{{ unreadAsk?.item.title || unreadAsk?.item.url }}” is on your reading list, but you haven't
      marked it as read. Read it before you link to it. If you have already read it, perhaps
      somewhere else, mark it as read.
    </ConfirmDialog>
  </div>
</template>
