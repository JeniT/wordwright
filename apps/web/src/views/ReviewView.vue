<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, useTemplateRef } from 'vue'
import { RouterLink } from 'vue-router'
import { WHOLE_DRAFT, blockHash, excerptOf, splitBlocks, type CommentInput } from '@wordwright/core'
import { blockFor } from '../lib/comment-target'
import CommentComposer from '../components/CommentComposer.vue'
import CommentsPanel from '../components/CommentsPanel.vue'
import type { CommentMarkPoint } from '../lib/comment-marks'
import ModalDialog from '../components/ModalDialog.vue'
import QueryState from '../components/QueryState.vue'
import RichEditor from '../components/RichEditor.vue'
import TabPanels from '../components/TabPanels.vue'
import { api, errorMessage } from '../lib/api'
import { queryKeys, useReviewComments } from '../lib/queries'

/**
 * One review: the copy of the draft that was sent (a snapshot, not the editor's latest words) and the comments this
 * person has made on it. Nobody else's comments are here and nothing else of the publication is. While the review is open
 * they can add comments or end it; an ended or closed review is read-only but still shows both.
 */
const props = defineProps<{ id: string }>()
const queryClient = useQueryClient()
const review = useQuery({
  queryKey: computed(() => queryKeys.review(props.id)),
  queryFn: () => api.getReview(props.id),
})
const blocks = computed(() => splitBlocks(review.data.value?.draft.body ?? ''))
const body = computed(() => review.data.value?.draft.body ?? '')

const editor = useTemplateRef<InstanceType<typeof RichEditor>>('editor')
const commentsPanel = useTemplateRef<InstanceType<typeof CommentsPanel>>('commentsPanel')
/** Where the focus last was, so Comment knows whether the title or the words of the draft are chosen. */
const caretIn = ref<'title' | 'body' | null>(null)
// A read-only draft takes no focus, so a press in it is what says the words (not the title) were chosen.
function noteFocus(event: Event) {
  const el = event.target as HTMLElement
  if (el.id === 'review-title') caretIn.value = 'title'
  else if (el.closest('.ProseMirror')) caretIn.value = 'body'
}
/** The comment being written: about the paragraph (and words) selected in the snapshot, or general. */
const composing = ref<{
  target: { block: string; number: number; quote: string | null; excerpt: string } | null
} | null>(null)
function startComment() {
  const at = caretIn.value === 'title' ? null : editor.value?.commentTarget()
  const found = at ? blockFor(at, blocks.value) : null
  const block = found ? blocks.value.find((b) => b.id === found.id) : undefined
  composing.value = {
    target:
      at && found && block
        ? {
            block: found.id,
            number: found.number,
            quote: at.quote,
            excerpt: excerptOf(block.text, 80),
          }
        : null,
  }
}

async function add(input: CommentInput) {
  await api.commentOnReview(props.id, input)
  await queryClient.invalidateQueries({ queryKey: queryKeys.review(props.id) })
}
const comments = computed(() => review.data.value?.comments ?? [])
/** The copy is frozen, so a comment's paragraph is either in it, unchanged, or the comment is general. */
const paragraphs = computed<Record<string, string>>(() => {
  const found: Record<string, string> = {}
  for (const c of comments.value) {
    const block = blocks.value.find((b) => b.id === c.block)
    if (block) found[c.id] = block.text
  }
  return found
})
const located = computed<ReadonlySet<string>>(() => new Set(Object.keys(paragraphs.value)))
const activePointId = ref<string | null>(null)
const markPoints = computed<CommentMarkPoint[]>(() =>
  comments.value.flatMap((c, i) =>
    c.block === WHOLE_DRAFT || !located.value.has(c.id)
      ? []
      : [
          {
            id: c.id,
            block: c.block,
            hash: c.hash ?? blockHash(paragraphs.value[c.id]!),
            excerpt: c.excerpt,
            blockText: c.blockText,
            number: i + 1,
            label: `Comment ${i + 1}`,
            byAi: false,
            quote: c.quote,
          },
        ],
  ),
)
function pickPoint(id: string) {
  activePointId.value = id
  void commentsPanel.value?.focusPoint(id)
  editor.value?.scrollToPoint(id)
}
function showInDraft(id: string) {
  activePointId.value = id
  void commentsPanel.value?.focusPoint(id, { focus: false })
  editor.value?.focusPoint(id)
}
const { edit: editMine, remove: deleteMine } = useReviewComments(() => props.id)
const end = useMutation({
  mutationFn: () => api.endReview(props.id),
  // Ending is final for this copy: the page stays, now read-only, with the copy and the comments.
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.reviews() })
    await queryClient.invalidateQueries({ queryKey: queryKeys.review(props.id) })
  },
})
</script>

<template>
  <div>
    <p class="mb-4 text-sm">
      <RouterLink :to="{ name: 'reviews' }" class="underline">← All your reviews</RouterLink>
    </p>
    <QueryState :query="review" what="this draft">
      <div
        v-if="review.data.value"
        class="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-10"
      >
        <article class="min-w-0 max-w-2xl" @focusin="noteFocus" @pointerdown="noteFocus">
          <h1 class="sr-only">{{ review.data.value.draft.title || 'Untitled draft' }}</h1>
          <label class="sr-only" for="review-title">Title</label>
          <!-- A read-only field, so the title can be selected and commented on like the paragraphs. -->
          <input
            id="review-title"
            :value="review.data.value.draft.title"
            readonly
            class="mb-1 w-full min-w-0 bg-transparent font-display text-3xl font-semibold outline-none placeholder:text-ink-soft"
            placeholder="Untitled draft"
          />
          <p class="meta mb-4">
            In {{ review.data.value.publicationName }}
            <template v-if="review.data.value.inviterName">
              · asked by {{ review.data.value.inviterName }}</template
            >
          </p>

          <p
            v-if="review.data.value.state === 'ended'"
            class="callout mb-4"
            data-testid="review-ended"
          >
            You ended this review. Your comments are kept, but you can’t add more.
          </p>
          <p
            v-else-if="review.data.value.state === 'closed'"
            class="callout mb-4"
            data-testid="review-ended"
          >
            This review is closed, so you can’t add comments. Your comments are kept.
          </p>
          <RichEditor
            ref="editor"
            :model-value="body"
            :editable="false"
            :comment-bar="review.data.value.state === 'open'"
            :comment-marks="markPoints"
            :active-point-id="activePointId"
            @comment="startComment"
            @point-pick="pickPoint"
          />

          <ModalDialog
            :open="!!composing"
            title="Add comment"
            :footer="false"
            @close="composing = null"
          >
            <CommentComposer
              v-if="composing"
              :target="composing.target"
              :add="add"
              audience="Only you and the draft’s editor will see this."
              @done="composing = null"
              @cancel="composing = null"
            />
          </ModalDialog>

          <section
            v-if="review.data.value.state === 'open'"
            class="mt-10 border-t border-line pt-4"
            aria-label="End the review"
          >
            <p class="mb-2 text-ink-soft">
              Ending the review tells the editor you have finished and how many comments you left.
              You can’t add more afterwards.
            </p>
            <button
              type="button"
              class="btn btn-outline"
              :disabled="end.isPending.value"
              @click="end.mutate()"
            >
              End review
            </button>
            <p v-if="end.isError.value" role="alert" class="mt-2 text-danger">
              {{ errorMessage(end.error.value) }}
            </p>
          </section>
        </article>
        <aside
          aria-label="Your comments"
          class="mt-8 lg:sticky lg:top-4 lg:mt-0 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
        >
          <TabPanels
            model-value="comments"
            :tabs="[{ id: 'comments', label: 'Comments' }]"
            label="Beside the draft"
          >
            <template #comments>
              <CommentsPanel
                ref="commentsPanel"
                :query="review"
                :comments="comments"
                :round="null"
                :pending="false"
                :error="null"
                :located="located"
                :paragraphs="paragraphs"
                :active-id="activePointId"
                :is-editor="false"
                :editor-name="review.data.value.inviterName ?? 'the editor'"
                :composing="null"
                :can-comment="false"
                :add="add"
                :me="null"
                :edit="editMine"
                :remove="deleteMine"
                @show="showInDraft"
                @start-comment="startComment"
              />
              <div v-if="review.data.value.state === 'open'" class="mt-6 border-t border-line pt-4">
                <button
                  type="button"
                  class="btn btn-outline"
                  :disabled="end.isPending.value"
                  @click="end.mutate()"
                >
                  End review
                </button>
              </div>
            </template>
          </TabPanels>
        </aside>
      </div>
    </QueryState>
  </div>
</template>
