<script setup lang="ts">
import { computed, nextTick } from 'vue'
import { RouterLink } from 'vue-router'
import type { CritiqueRound } from '@lfwa/core'
import { ApiError, errorMessage } from '../lib/api'
import { scrollAreaOf, scrollAreaToTop } from '../lib/scroll'

/**
 * The comments on the draft: the latest critique's summary, then its points in order of importance. Pressing a
 * comment about a paragraph shows that paragraph in the draft. A point about a paragraph that has since been
 * rewritten is listed apart, without a mark, rather than put on the wrong paragraph. The writer can set a point
 * aside (it is kept, and can be brought back): the call is theirs.
 */
const props = defineProps<{
  pending: boolean
  error: unknown
  round: CritiqueRound | null | undefined
  /** Ids of the points whose paragraph is in the text now. */
  located: ReadonlySet<string>
  activeId: string | null
}>()
const emit = defineEmits<{
  /** A comment was pressed: show it in the draft. */
  show: [id: string]
  setAside: [id: string, dismissed: boolean]
}>()

type Entry = CritiqueRound['points'][number] & { number: number }
const entries = computed<Entry[]>(() =>
  (props.round?.points ?? []).map((p, i) => ({ ...p, number: i + 1 })),
)
const open = computed(() => entries.value.filter((p) => !p.dismissed))
const placed = computed(() =>
  open.value.filter((p) => p.block === 'whole' || props.located.has(p.id)),
)
const changed = computed(() =>
  open.value.filter((p) => p.block !== 'whole' && !props.located.has(p.id)),
)
const setAside = computed(() => entries.value.filter((p) => p.dismissed))

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
defineExpose({ focusPoint })
</script>

<template>
  <!-- With several comments, room below the last so that it too can scroll to the top of the area. -->
  <section aria-labelledby="critique-heading" :class="open.length > 1 ? 'pb-[70vh]' : ''">
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
          <!-- A comment about a paragraph is a button: pressing it shows the paragraph in the draft. -->
          <button
            v-if="p.block !== 'whole'"
            :id="`critique-point-${p.id}`"
            type="button"
            class="block w-full rounded-ctl border-2 bg-surface p-3 text-left hover:bg-sunken"
            :class="p.id === activeId ? 'border-accent' : 'border-line-strong'"
            :aria-current="p.id === activeId ? 'true' : undefined"
            @click="emit('show', p.id)"
          >
            <span class="block text-sm text-ink-soft">
              <span class="chip chip-ai mr-1">{{ p.number }}</span
              >“{{ p.excerpt }}”
            </span>
            <span class="block font-medium">{{ p.point }}</span>
            <span class="block text-ink-soft">{{ p.reason }}</span>
            <span class="sr-only">Press to show it in the draft.</span>
          </button>
          <div v-else class="rounded-ctl border-2 border-line-strong p-3">
            <p class="text-sm text-ink-soft">
              <span class="chip chip-ai mr-1">{{ p.number }}</span
              >The whole piece
            </p>
            <p class="font-medium">{{ p.point }}</p>
            <p class="text-ink-soft">{{ p.reason }}</p>
          </div>
          <p class="mt-1">
            <button
              type="button"
              class="btn btn-sm btn-quiet"
              @click="emit('setAside', p.id, true)"
            >
              Set aside<span class="sr-only"> point {{ p.number }}</span>
            </button>
          </p>
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
            <div class="rounded-ctl border-2 border-line p-3">
              <p class="text-sm text-ink-soft">
                <span class="chip chip-ai mr-1">{{ p.number }}</span>
                It was: “{{ p.excerpt }}”
              </p>
              <p class="font-medium">{{ p.point }}</p>
              <p class="text-ink-soft">{{ p.reason }}</p>
            </div>
            <p class="mt-1">
              <button
                type="button"
                class="btn btn-sm btn-quiet"
                @click="emit('setAside', p.id, true)"
              >
                Set aside<span class="sr-only"> point {{ p.number }}</span>
              </button>
            </p>
          </li>
        </ol>
      </template>

      <details v-if="setAside.length" class="mt-4">
        <summary class="cursor-pointer underline">Set aside ({{ setAside.length }})</summary>
        <ol class="mt-2 space-y-3">
          <li v-for="p in setAside" :key="p.id" class="border-l-2 border-line pl-3 text-ink-soft">
            <p class="text-sm">
              <span class="chip chip-quiet mr-1">{{ p.number }}</span>
              <template v-if="p.block === 'whole'">The whole piece</template>
              <template v-else>“{{ p.excerpt }}”</template>
            </p>
            <p>{{ p.point }}</p>
            <p class="mt-1">
              <button
                type="button"
                class="btn btn-sm btn-quiet"
                @click="emit('setAside', p.id, false)"
              >
                Bring back<span class="sr-only"> point {{ p.number }}</span>
              </button>
            </p>
          </li>
        </ol>
      </details>
    </template>
  </section>
</template>
