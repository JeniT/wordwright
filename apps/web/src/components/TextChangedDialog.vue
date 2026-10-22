<script setup lang="ts">
import { computed } from 'vue'
import type { DraftComment } from '@wordwright/core'
import { diffWords, plainText, type Run } from '../lib/word-diff'
import ModalDialog from './ModalDialog.vue'

/**
 * What a comment was about, then and now: the paragraph as it was when the comment was made beside the paragraph as it
 * is in the draft, with the words that differ underlined (now) and struck through (then), so the change shows without
 * colour. The comment is underneath. With no paragraph now it is the old one alone; a comment from before the whole
 * paragraph was kept has only its start, so nothing is marked as changed.
 */
const props = defineProps<{
  open: boolean
  comment: DraftComment | null
  /** The paragraph as the draft has it now; null if it isn't in the draft. */
  now: string | null
}>()
const emit = defineEmits<{ close: [] }>()

const kept = computed(() => !!props.comment?.blockText)
const was = computed(() => plainText(props.comment?.blockText ?? props.comment?.excerpt ?? ''))
const runs = computed<{ then: Run[]; now: Run[] } | null>(() =>
  props.now === null
    ? null
    : kept.value
      ? diffWords(was.value, plainText(props.now))
      : {
          then: [{ text: was.value, changed: false }],
          now: [{ text: plainText(props.now), changed: false }],
        },
)
</script>

<template>
  <ModalDialog :open="open" title="Text changed" wide @close="emit('close')">
    <template v-if="comment">
      <div class="grid gap-4 sm:grid-cols-2">
        <section aria-labelledby="then-heading">
          <h3 id="then-heading" class="mb-1 font-medium">Then</h3>
          <p class="whitespace-pre-wrap">
            <template v-for="(r, i) in runs?.then ?? [{ text: was, changed: false }]" :key="i">
              <del v-if="r.changed" class="text-ink-soft">{{ r.text }}</del>
              <template v-else>{{ r.text }}</template>
              {{ ' ' }}
            </template>
          </p>
          <p v-if="!kept" class="mt-1 text-ink-soft">The full original wasn’t kept.</p>
        </section>
        <section aria-labelledby="now-heading">
          <h3 id="now-heading" class="mb-1 font-medium">Now</h3>
          <p v-if="!runs" class="text-ink-soft">This paragraph isn’t in the draft now.</p>
          <p v-else class="whitespace-pre-wrap">
            <template v-for="(r, i) in runs.now" :key="i">
              <ins v-if="r.changed" class="font-medium underline decoration-2">{{ r.text }}</ins>
              <template v-else>{{ r.text }}</template>
              {{ ' ' }}
            </template>
          </p>
        </section>
      </div>
      <section class="mt-4 border-t border-line pt-3" aria-labelledby="the-comment-heading">
        <h3 id="the-comment-heading" class="mb-1 font-medium">The comment</h3>
        <p class="whitespace-pre-wrap">{{ comment.text }}</p>
        <p v-if="comment.reason" class="mt-1 text-ink-soft">{{ comment.reason }}</p>
      </section>
    </template>
  </ModalDialog>
</template>
