<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import {
  WHOLE_DRAFT,
  blockHash,
  type CommentInput,
  type CritiqueRound,
  type DraftComment,
} from '@wordwright/core'
import { errorMessage } from '../lib/api'
import { keyProblemOf } from '../lib/key-problem'
import AiProblemAlert from './AiProblemAlert.vue'
import type { QueryStatus } from '../lib/queries'
import { scrollAreaOf, scrollAreaToTop } from '../lib/scroll'
import CommentCard from './CommentCard.vue'
import CommentComposer from './CommentComposer.vue'
import QueryState from './QueryState.vue'
import TextChangedDialog from './TextChangedDialog.vue'
import Explain from './Explain.vue'
import SwitchField from './SwitchField.vue'

/**
 * The comments on the draft, from members and from the AI's critique, in one list. The editor sees every one and
 * says which are resolved; everyone else sees only their own (the server decides; this shows what it sent). Pressing
 * a comment about a paragraph shows that paragraph in the draft. A paragraph is found again by the words it shares
 * with the old one; one that has been edited since gets a Text changed button (then and now), and one that is gone is
 * listed without a mark rather than put on the wrong paragraph. Resolved comments are hidden, not deleted, and the
 * editor can show them again.
 */
const props = defineProps<{
  /** The comments query, shown with its own loading and error states. */
  query: QueryStatus
  comments: DraftComment[]
  /** The latest critique (its summary), if this person may see it. */
  round: CritiqueRound | null | undefined
  /** A critique is being made. */
  pending: boolean
  /** Why the last critique could not be made, if it could not. */
  error: unknown
  /** Ids of the comments whose paragraph is in the text now. */
  located: ReadonlySet<string>
  /** The words of each located comment's paragraph as the draft has them now. */
  paragraphs: Readonly<Record<string, string>>
  activeId: string | null
  isEditor: boolean
  editorName: string
  /** A comment is being written (the Comment button was pressed); null when not, `target: null` for a general one. */
  composing: {
    id: number
    target: { block: string; number: number; quote: string | null } | null
  } | null
  add: (input: CommentInput) => Promise<unknown>
  /** Why the last Resolved switch could not be saved, if it could not. */
  resolveProblem?: string
}>()
const emit = defineEmits<{
  /** A comment was pressed: show it in the draft. */
  show: [id: string]
  setResolved: [id: string, resolved: boolean]
  /** The composer closed, with the comment added or not. */
  closeComposer: []
}>()

const showResolved = ref(false)

type Entry = DraftComment & { number: number }
/** Numbered by place in the whole list, so showing the resolved ones does not renumber the others. */
const numbered = computed<Entry[]>(() => props.comments.map((c, i) => ({ ...c, number: i + 1 })))
const resolvedCount = computed(() => numbered.value.filter((c) => c.resolved).length)
const shown = computed(() => numbered.value.filter((c) => showResolved.value || !c.resolved))

/** Its paragraph has been edited since it was written, or is gone. */
function textChanged(c: DraftComment) {
  if (c.block === WHOLE_DRAFT || c.hash === null) return false
  const now = props.paragraphs[c.id]
  return now === undefined || blockHash(now) !== c.hash
}
const reading = ref<DraftComment | null>(null)

/** Each comment, so a Resolved switch that could not be saved can be put back. */
const cards = ref<Record<string, InstanceType<typeof CommentCard> | null>>({})
const remember = (id: string) => (el: unknown) => {
  cards.value[id] = el as InstanceType<typeof CommentCard> | null
}

/**
 * Scrolls the comments so this one is at the top of their area, and (unless `focus` is false) moves focus to it,
 * without letting the focus scroll the page: where the paragraph goes is up to the draft.
 */
async function focusPoint(id: string, { focus = true } = {}) {
  await nextTick()
  const el = document.getElementById(`comment-${id}`)
  if (!el) return
  scrollAreaToTop(el, scrollAreaOf(el))
  if (focus) el.querySelector<HTMLElement>('[data-comment-button]')?.focus({ preventScroll: true })
}

const audience = computed(() =>
  props.isEditor ? undefined : `Only you and ${props.editorName}, the editor, will see this.`,
)
const composer = useTemplateRef<InstanceType<typeof CommentComposer>>('composer')
defineExpose({
  focusPoint,
  revert: (id: string) => cards.value[id]?.revert(),
  focusComposer: async () => {
    await nextTick()
    composer.value?.focus()
  },
})
</script>

<template>
  <!-- With several comments, room below the last so that it too can scroll to the top of the area. -->
  <section aria-labelledby="comments-heading" :class="shown.length > 1 ? 'pb-[70vh]' : ''">
    <!-- The tab beside the draft already says "Comments"; the heading is for screen readers moving by headings. -->
    <h2 id="comments-heading" class="sr-only">Comments</h2>
    <CommentComposer
      v-if="composing"
      :key="composing.id"
      ref="composer"
      class="mb-4"
      :target="composing.target"
      :add="add"
      :audience="audience"
      @done="emit('closeComposer')"
      @cancel="emit('closeComposer')"
    />
    <p v-if="pending" role="status">Reading your draft…</p>
    <AiProblemAlert
      v-else-if="error"
      :message="errorMessage(error)"
      :key-problem="keyProblemOf(error)"
    />
    <template v-if="round && !pending">
      <p>
        <span class="chip chip-ai mr-1">Your AI</span>
        {{ round.summary }}
      </p>
      <p v-if="round.ready" class="mt-2 text-ink-soft">
        Nothing important left to fix. What remains is a matter of taste, so it may be time to
        publish.
      </p>
    </template>

    <QueryState :query="query" what="the comments">
      <p v-if="!comments.length && !round && !pending" class="text-sm text-ink-soft">
        <template v-if="isEditor">
          No comments yet. Press Critique, or select words and press Comment.
        </template>
        <template v-else> You haven’t commented yet. Select words and press Comment. </template>
      </p>
      <Explain v-if="isEditor && !comments.length && !round && !pending" tutorial-only class="mt-2">
        Each comment is marked beside the paragraph it is about. Resolved comments are hidden, never
        deleted.
      </Explain>

      <div v-if="isEditor && resolvedCount" class="mt-3">
        <SwitchField v-model="showResolved" compact :label="`Show resolved (${resolvedCount})`" />
      </div>

      <ol v-if="shown.length" class="mt-3 space-y-3">
        <li v-for="c in shown" :key="c.id">
          <CommentCard
            :ref="remember(c.id)"
            :entry="c"
            :kind="c.block === WHOLE_DRAFT ? 'plain' : located.has(c.id) ? 'show' : 'static'"
            :active="c.id === activeId"
            :is-editor="isEditor"
            :text-changed="textChanged(c)"
            @show="emit('show', c.id)"
            @show-change="reading = c"
            @set-resolved="(resolved) => emit('setResolved', c.id, resolved)"
          />
        </li>
      </ol>

      <p v-if="resolveProblem" role="alert" class="mt-3 text-danger">{{ resolveProblem }}</p>
    </QueryState>
    <TextChangedDialog
      :open="!!reading"
      :comment="reading"
      :now="reading ? (paragraphs[reading.id] ?? null) : null"
      @close="reading = null"
    />
  </section>
</template>
