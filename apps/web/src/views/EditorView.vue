<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import CritiquePanel from '../components/CritiquePanel.vue'
import DraftInsertions from '../components/DraftInsertions.vue'
import DraftNotes from '../components/DraftNotes.vue'
import DraftReadingList from '../components/DraftReadingList.vue'
import RichEditor from '../components/RichEditor.vue'
import { RouterLink, useRouter } from 'vue-router'
import type { IdeaLink, IdeaNote } from '@lfwa/core'
import { api, errorMessage } from '../lib/api'
import type { CritiqueMarkPoint } from '../lib/critique-marks'
import { linkMarkdown, noteMarkdown } from '../lib/note-insert'

const props = defineProps<{ profileId: string; id: string }>()
const queryClient = useQueryClient()
const router = useRouter()

const draft = useQuery({
  queryKey: ['draft', () => props.profileId, () => props.id],
  queryFn: () => api.getDraft(props.profileId, props.id),
})
// Every draft develops an idea, which it links back to.
const idea = useQuery({
  queryKey: ['idea', () => props.profileId, () => draft.data.value?.ideaId],
  queryFn: () => api.getIdea(props.profileId, draft.data.value!.ideaId!),
  enabled: () => !!draft.data.value?.ideaId,
})
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
  onSuccess: (saved) => queryClient.setQueryData(['draft', props.profileId, props.id], saved),
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
    queryClient.setQueryData(['idea', props.profileId, updated.id], updated)
    await queryClient.invalidateQueries({ queryKey: ['ideas'] })
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
    .getQueryData<IdeaNote[]>(['notes', props.profileId, ideaId])
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
    await Promise.all(
      ['notes', 'idea', 'ideas', 'draft-insertions'].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    )
  }
}

// On a phone the notes slide in over the page; beside the draft on a wide screen they are always there.
const notesOpen = ref(false)
const openButton = useTemplateRef<HTMLButtonElement>('openButton')
const closeButton = useTemplateRef<HTMLButtonElement>('closeButton')
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
  onSuccess: (round) => {
    queryClient.setQueryData(['critique', props.profileId, props.id], round)
    activePointId.value = null
  },
})
const setAside = useMutation({
  mutationFn: (v: { pointId: string; dismissed: boolean }) =>
    api.setCritiquePointDismissed(props.profileId, props.id, v.pointId, v.dismissed),
  onSuccess: (round) => queryClient.setQueryData(['critique', props.profileId, props.id], round),
})
const round = computed(() => lastCritique.data.value)
const critiquePanel = useTemplateRef<InstanceType<typeof CritiquePanel>>('critiquePanel')
const activePointId = ref<string | null>(null)
const located = ref<ReadonlySet<string>>(new Set())
const markPoints = computed<CritiqueMarkPoint[]>(() =>
  (round.value?.points ?? []).flatMap((p, i) =>
    p.dismissed || p.block === 'whole'
      ? []
      : [
          {
            id: p.id,
            block: p.block,
            hash: p.hash,
            excerpt: p.excerpt,
            number: i + 1,
            label: `Critique point ${i + 1}`,
          },
        ],
  ),
)

function pickPoint(id: string) {
  activePointId.value = id
  void critiquePanel.value?.focusPoint(id)
}
function showInDraft(id: string) {
  activePointId.value = id
  editor.value?.focusPoint(id)
}

async function requestCritique() {
  await save.mutateAsync() // critique the latest text
  critique.mutate()
}
</script>

<template>
  <p v-if="draft.isPending.value">Loading…</p>
  <p v-else-if="draft.isError.value" role="alert" class="text-danger">Couldn't load this draft.</p>
  <div v-else class="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-10">
    <article class="min-w-0 max-w-2xl">
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
          :disabled="critique.isPending.value"
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
          Notes
        </button>
        <p role="status" class="text-sm text-ink-soft">
          <template v-if="save.isPending.value">Saving…</template>
          <template v-else-if="save.isSuccess.value">Saved</template>
          <template v-else-if="save.isError.value">Couldn't save</template>
        </p>
      </div>

      <CritiquePanel
        ref="critiquePanel"
        :pending="critique.isPending.value"
        :error="critique.error.value ?? lastCritique.error.value"
        :round="round"
        :located="located"
        :active-id="activePointId"
        @pick="activePointId = $event"
        @show-in-draft="showInDraft"
        @set-aside="(pointId, dismissed) => setAside.mutate({ pointId, dismissed })"
      />

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
      aria-labelledby="draft-notes-heading"
      class="mt-8 lg:sticky lg:top-4 lg:mt-0 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:mt-0 max-lg:w-[min(22rem,90vw)] max-lg:overflow-y-auto max-lg:bg-sunken max-lg:p-4 max-lg:shadow-xl max-lg:transition-[transform,visibility] motion-reduce:transition-none"
      :class="notesOpen ? '' : 'max-lg:invisible max-lg:translate-x-full'"
      @keydown.esc="notesOpen && closeNotes()"
    >
      <button
        ref="closeButton"
        type="button"
        class="btn btn-neutral mb-3 lg:hidden"
        @click="closeNotes"
      >
        Close notes
      </button>
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
      <DraftReadingList :reading-list="idea.data.value?.links ?? []" :insert-link="insertLink" />
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
