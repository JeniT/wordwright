<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { CritiqueRound } from '@lfwa/core'
import { ApiError, errorMessage } from '../lib/api'
import { scrollAreaOf, scrollAreaToTop } from '../lib/scroll'
import CritiqueComment from './CritiqueComment.vue'

/**
 * The comments on the draft: the latest critique's summary, then its points in order of importance. Pressing a
 * comment about a paragraph shows that paragraph in the draft. A point about a paragraph that has since been
 * rewritten is listed apart, without a mark, rather than put on the wrong paragraph. The writer marks a comment Read
 * when they have dealt with it: it stays where it is, quieter, and its mark leaves the text.
 */
const props = defineProps<{
  pending: boolean
  error: unknown
  round: CritiqueRound | null | undefined
  /** Ids of the points whose paragraph is in the text now. */
  located: ReadonlySet<string>
  activeId: string | null
  /** Why the last Read switch could not be saved, if it could not. */
  readProblem?: string
}>()
const emit = defineEmits<{
  /** A comment was pressed: show it in the draft. */
  show: [id: string]
  setRead: [id: string, read: boolean]
}>()

type Entry = CritiqueRound['points'][number] & { number: number }
const entries = computed<Entry[]>(() =>
  (props.round?.points ?? []).map((p, i) => ({ ...p, number: i + 1 })),
)
const placed = computed(() =>
  entries.value.filter((p) => p.block === 'whole' || props.located.has(p.id)),
)
const changed = computed(() =>
  entries.value.filter((p) => p.block !== 'whole' && !props.located.has(p.id)),
)

/** Each comment, so a Read switch that could not be saved can be put back. */
const comments = ref<Record<string, InstanceType<typeof CritiqueComment> | null>>({})
const remember = (id: string) => (el: unknown) => {
  comments.value[id] = el as InstanceType<typeof CritiqueComment> | null
}

/**
 * Scrolls the comments so this one is at the top of their area, and (unless `focus` is false) moves focus to it,
 * without letting the focus scroll the page: where the paragraph goes is up to the draft.
 */
async function focusPoint(id: string, { focus = true } = {}) {
  await nextTick()
  const el = document.getElementById(`critique-point-${id}`)
  if (!el) return
  scrollAreaToTop(el, scrollAreaOf(el))
  if (focus) el.focus({ preventScroll: true })
}
defineExpose({ focusPoint, revert: (id: string) => comments.value[id]?.revert() })
</script>

<template>
  <!-- With several comments, room below the last so that it too can scroll to the top of the area. -->
  <section aria-labelledby="critique-heading" :class="entries.length > 1 ? 'pb-[70vh]' : ''">
    <!-- The tab beside the draft already says "Comments"; the heading is for screen readers moving by headings. -->
    <h2 id="critique-heading" class="sr-only">Comments</h2>
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
    <p v-else-if="!round" class="text-sm text-ink-soft">
      No comments yet. Press Critique to have the draft read and its weakest points pointed out.
      Each one is marked beside the paragraph it is about.
    </p>
    <template v-else>
      <p>{{ round.summary }}</p>
      <p v-if="round.ready" class="mt-2 text-ink-soft">
        Nothing important left to fix. What remains is a matter of taste, so it may be time to
        publish.
      </p>

      <ol v-if="placed.length" class="mt-3 space-y-3">
        <li v-for="p in placed" :key="p.id">
          <CritiqueComment
            :ref="remember(p.id)"
            :entry="p"
            :kind="p.block === 'whole' ? 'plain' : 'show'"
            :active="p.id === activeId"
            @show="emit('show', p.id)"
            @set-read="(read) => emit('setRead', p.id, read)"
          />
        </li>
      </ol>

      <template v-if="changed.length">
        <h3 class="mt-4 font-medium">This passage has changed</h3>
        <p class="text-sm text-ink-soft">
          You have rewritten the paragraph these points were about, so they have no mark in the
          text.
        </p>
        <ol class="mt-2 space-y-3">
          <li v-for="p in changed" :key="p.id">
            <CritiqueComment
              :ref="remember(p.id)"
              :entry="p"
              kind="changed"
              @set-read="(read) => emit('setRead', p.id, read)"
            />
          </li>
        </ol>
      </template>

      <p v-if="readProblem" role="alert" class="mt-3 text-danger">{{ readProblem }}</p>
    </template>
  </section>
</template>
