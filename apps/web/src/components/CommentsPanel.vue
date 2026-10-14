<script setup lang="ts">
import { computed, nextTick, ref, type Ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { CommentInput, CritiqueRound, DraftComment } from '@lfwa/core'
import { ApiError, errorMessage } from '../lib/api'
import { scrollAreaOf, scrollAreaToTop } from '../lib/scroll'
import CommentCard from './CommentCard.vue'
import CommentForm from './CommentForm.vue'
import QueryState from './QueryState.vue'
import SwitchField from './SwitchField.vue'

/**
 * The comments on the draft, from members and from the AI's critique, in one list. The editor sees every one and
 * says which are resolved; everyone else sees only their own (the server decides; this shows what it sent). Pressing
 * a comment about a paragraph shows that paragraph in the draft. One about a paragraph that has since been rewritten
 * is listed apart, without a mark, rather than put on the wrong paragraph, and stays open until the editor resolves
 * it. Resolved comments are hidden, not deleted, and the editor can show them again.
 */
const props = defineProps<{
  /** The comments query, shown with its own loading and error states. */
  query: {
    isPending: Ref<boolean>
    isError: Ref<boolean>
    error?: Ref<unknown>
    refetch: () => unknown
  }
  comments: DraftComment[]
  /** The latest critique (its summary), if this person may see it. */
  round: CritiqueRound | null | undefined
  /** A critique is being made. */
  pending: boolean
  /** Why the last critique could not be made, if it could not. */
  error: unknown
  /** Ids of the comments whose paragraph is in the text now. */
  located: ReadonlySet<string>
  activeId: string | null
  isEditor: boolean
  viewerId: string | undefined
  editorName: string
  /** The paragraphs of the draft as saved, to choose what a new comment is about. */
  blocks: { id: string; text: string }[]
  add: (input: CommentInput) => Promise<unknown>
  /** Why the last Resolved switch could not be saved, if it could not. */
  resolveProblem?: string
}>()
const emit = defineEmits<{
  /** A comment was pressed: show it in the draft. */
  show: [id: string]
  setResolved: [id: string, resolved: boolean]
}>()

const showResolved = ref(false)

type Entry = DraftComment & { number: number }
/** Numbered by place in the whole list, so showing the resolved ones does not renumber the others. */
const numbered = computed<Entry[]>(() => props.comments.map((c, i) => ({ ...c, number: i + 1 })))
const resolvedCount = computed(() => numbered.value.filter((c) => c.resolved).length)
const shown = computed(() => numbered.value.filter((c) => showResolved.value || !c.resolved))
const placed = computed(() =>
  shown.value.filter((c) => c.block === 'whole' || props.located.has(c.id)),
)
const changed = computed(() =>
  shown.value.filter((c) => c.block !== 'whole' && !props.located.has(c.id)),
)

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
  if (focus) el.focus({ preventScroll: true })
}
defineExpose({ focusPoint, revert: (id: string) => cards.value[id]?.revert() })

const audience = computed(() =>
  props.isEditor
    ? 'You can see everyone’s comments. Each member sees only their own.'
    : `Only you and ${props.editorName}, the editor, will see this.`,
)
</script>

<template>
  <!-- With several comments, room below the last so that it too can scroll to the top of the area. -->
  <section aria-labelledby="comments-heading" :class="shown.length > 1 ? 'pb-[70vh]' : ''">
    <!-- The tab beside the draft already says "Comments"; the heading is for screen readers moving by headings. -->
    <h2 id="comments-heading" class="sr-only">Comments</h2>
    <p v-if="pending" role="status">Reading your draft…</p>
    <p v-else-if="error" role="alert" class="text-danger">
      {{ errorMessage(error) }}
      <RouterLink
        v-if="error instanceof ApiError && [400, 409].includes(error.status)"
        to="/account"
        class="underline"
        >Go to account settings</RouterLink
      >
    </p>
    <template v-if="round && !pending">
      <p>{{ round.summary }}</p>
      <p v-if="round.ready" class="mt-2 text-ink-soft">
        Nothing important left to fix. What remains is a matter of taste, so it may be time to
        publish.
      </p>
    </template>

    <QueryState :query="query" what="the comments">
      <p v-if="!comments.length && !round && !pending" class="text-sm text-ink-soft">
        <template v-if="isEditor">
          No comments yet. Press Critique to have the draft read and its weakest points pointed out,
          or add your own below. Each one is marked beside the paragraph it is about.
        </template>
        <template v-else>
          You haven't commented on this draft yet. Pick a paragraph below, or the whole draft, and
          say what you think of it.
        </template>
      </p>

      <div v-if="isEditor && resolvedCount" class="mt-3">
        <SwitchField v-model="showResolved" :label="`Show resolved (${resolvedCount})`" />
      </div>

      <ol v-if="placed.length" class="mt-3 space-y-3">
        <li v-for="c in placed" :key="c.id">
          <CommentCard
            :ref="remember(c.id)"
            :entry="c"
            :kind="c.block === 'whole' ? 'plain' : 'show'"
            :active="c.id === activeId"
            :show-author="isEditor"
            :can-resolve="isEditor"
            :viewer-id="viewerId"
            @show="emit('show', c.id)"
            @set-resolved="(resolved) => emit('setResolved', c.id, resolved)"
          />
        </li>
      </ol>

      <template v-if="changed.length">
        <h3 class="mt-4 font-medium">This passage has changed</h3>
        <p class="text-sm text-ink-soft">
          The paragraph these comments were about has been rewritten, so they have no mark in the
          text.
        </p>
        <ol class="mt-2 space-y-3">
          <li v-for="c in changed" :key="c.id">
            <CommentCard
              :ref="remember(c.id)"
              :entry="c"
              kind="changed"
              :show-author="isEditor"
              :can-resolve="isEditor"
              :viewer-id="viewerId"
              @set-resolved="(resolved) => emit('setResolved', c.id, resolved)"
            />
          </li>
        </ol>
      </template>

      <p v-if="resolveProblem" role="alert" class="mt-3 text-danger">{{ resolveProblem }}</p>
    </QueryState>

    <CommentForm :blocks="blocks" :add="add" :audience="audience" />
  </section>
</template>
