<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDraft } from '../lib/queries'
import QueryState from './QueryState.vue'

/**
 * One draft, ready to be taken elsewhere: its Markdown, to copy in one press. The title leads as a heading, so
 * what lands in a Markdown-aware editor (or an email) keeps its structure. The text is also shown, selectable,
 * for when the browser won't let us reach the clipboard.
 */
const props = defineProps<{ profileId: string; draftId: string }>()

// Shares its cache with the drafting page, so a draft just written is what is offered here.
const draft = useDraft(
  () => props.profileId,
  () => props.draftId,
)

const markdown = computed(() => {
  const d = draft.data.value
  if (!d) return ''
  const title = d.title.trim() || 'Untitled'
  return `# ${title}\n\n${d.body.trim()}\n`
})
const words = computed(() => {
  const text = draft.data.value?.body.trim() ?? ''
  return text ? text.split(/\s+/).length : 0
})

const status = ref<'idle' | 'copied' | 'failed'>('idle')
const showing = ref(false)
async function copy() {
  try {
    await navigator.clipboard.writeText(markdown.value)
    status.value = 'copied'
  } catch {
    // No clipboard access (an insecure page, or the browser said no): show the text to select instead.
    status.value = 'failed'
    showing.value = true
  }
}
</script>

<template>
  <li class="px-4 py-4 sm:px-5">
    <QueryState :query="draft" what="this draft">
      <template v-if="draft.data.value">
        <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div class="min-w-0 flex-1">
            <h2 class="h3 break-words">{{ draft.data.value.title || 'Untitled' }}</h2>
            <p class="meta">{{ words }} {{ words === 1 ? 'word' : 'words' }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" class="btn btn-primary btn-sm" @click="copy">
              Copy Markdown
            </button>
            <button
              type="button"
              class="btn btn-neutral btn-sm"
              :aria-expanded="showing"
              @click="showing = !showing"
            >
              {{ showing ? 'Hide Markdown' : 'Show Markdown' }}
            </button>
          </div>
        </div>
        <p role="status" class="meta mt-2">
          <template v-if="status === 'copied'">Copied. Paste it where you publish.</template>
          <template v-else-if="status === 'failed'">
            We couldn't reach your clipboard. Select the text below and copy it.
          </template>
        </p>
        <div v-if="showing" class="mt-3">
          <label class="sr-only" :for="`md-${draftId}`">
            Markdown of “{{ draft.data.value.title || 'Untitled' }}”
          </label>
          <textarea
            :id="`md-${draftId}`"
            class="field !min-h-0 font-mono text-sm"
            rows="12"
            readonly
            :value="markdown"
            @focus="($event.target as HTMLTextAreaElement).select()"
          ></textarea>
        </div>
      </template>
    </QueryState>
  </li>
</template>
