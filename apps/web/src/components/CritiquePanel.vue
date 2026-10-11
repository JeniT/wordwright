<script setup lang="ts">
import { computed, nextTick } from 'vue'
import { RouterLink } from 'vue-router'
import type { CritiqueRound } from '@lfwa/core'
import { ApiError, errorMessage } from '../lib/api'

/**
 * The latest critique of the draft: a summary, then the points in order of importance. A point about a paragraph that
 * can still be found in the text has a mark beside that paragraph, and "Show in draft" goes there. One whose paragraph
 * has since been rewritten is listed apart, without a mark, rather than put on the wrong paragraph. The writer can set
 * a point aside (it is kept, and can be brought back): the call is theirs.
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
  pick: [id: string]
  showInDraft: [id: string]
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

/** Moves the reader to a point in the list (a mark in the text was pressed). */
async function focusPoint(id: string) {
  await nextTick()
  const el = document.getElementById(`critique-point-${id}`)
  el?.scrollIntoView?.({ block: 'nearest' })
  el?.focus()
}
defineExpose({ focusPoint })
</script>

<template>
  <section
    v-if="pending || round || error"
    class="mt-6 rounded-ctl border border-line bg-surface p-4"
    aria-labelledby="critique-heading"
  >
    <h2 id="critique-heading" class="mb-2 font-semibold">Critique</h2>
    <p v-if="pending">Reading your draft…</p>
    <p v-else-if="error" role="alert" class="text-danger">
      {{ errorMessage(error) }}
      <RouterLink
        v-if="error instanceof ApiError && [400, 409].includes(error.status)"
        to="/account"
        class="underline"
        >Go to account settings</RouterLink
      >
    </p>
    <template v-else-if="round">
      <p>{{ round.summary }}</p>
      <p v-if="round.ready" class="mt-2 text-ink-soft">
        Nothing important left to fix. What remains is a matter of taste, so it may be time to
        publish.
      </p>

      <ol v-if="placed.length" class="mt-3 space-y-3">
        <li
          v-for="p in placed"
          :id="`critique-point-${p.id}`"
          :key="p.id"
          tabindex="-1"
          class="border-l-2 pl-3"
          :class="p.id === activeId ? 'border-accent' : 'border-line-strong'"
          :aria-current="p.id === activeId ? 'true' : undefined"
          @click="emit('pick', p.id)"
        >
          <p class="text-sm text-ink-soft">
            <span class="chip chip-ai mr-1">{{ p.number }}</span>
            <template v-if="p.block === 'whole'">The whole piece</template>
            <template v-else>“{{ p.excerpt }}”</template>
          </p>
          <p class="font-medium">{{ p.point }}</p>
          <p class="text-ink-soft">{{ p.reason }}</p>
          <p class="mt-1 flex gap-2">
            <button
              v-if="p.block !== 'whole'"
              type="button"
              class="btn btn-sm btn-outline"
              @click.stop="emit('showInDraft', p.id)"
            >
              Show in draft<span class="sr-only"> (point {{ p.number }})</span>
            </button>
            <button
              type="button"
              class="btn btn-sm btn-quiet"
              @click.stop="emit('setAside', p.id, true)"
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
          <li
            v-for="p in changed"
            :id="`critique-point-${p.id}`"
            :key="p.id"
            tabindex="-1"
            class="border-l-2 border-line-strong pl-3"
          >
            <p class="text-sm text-ink-soft">
              <span class="chip chip-ai mr-1">{{ p.number }}</span>
              It was: “{{ p.excerpt }}”
            </p>
            <p class="font-medium">{{ p.point }}</p>
            <p class="text-ink-soft">{{ p.reason }}</p>
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
