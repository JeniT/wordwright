<script setup lang="ts">
import { computed, ref } from 'vue'
import { renderMarkdown } from '../lib/markdown'
import Explain from './Explain.vue'

/**
 * The end of the Draft page: the draft as it stands, ready to be taken elsewhere. **Copy** puts it on the clipboard
 * as rich text (so headings, links and emphasis survive a paste into an editor or an email) with plain text beside
 * it for places that take only that; **Copy as Markdown** puts the Markdown itself, title first as a heading. Both
 * copy what is on the page now, saved or not. If the browser won't let us reach the clipboard the text is shown to
 * select instead. Publishing straight to a newsletter would add its own buttons here; none exist yet.
 */
const props = defineProps<{ title: string; body: string }>()

const heading = computed(() => props.title.trim() || 'Untitled')
const markdown = computed(() => `# ${heading.value}\n\n${props.body.trim()}\n`)
const plain = computed(() => `${heading.value}\n\n${props.body.trim()}\n`)
const html = computed(() => {
  const escaped = heading.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<h1>${escaped}</h1>\n${renderMarkdown(props.body.trim())}`
})
const empty = computed(() => !props.title.trim() && !props.body.trim())

const status = ref<'idle' | 'copied' | 'copied-markdown' | 'failed'>('idle')
const fallback = ref('')

async function copyMarkdown() {
  try {
    await navigator.clipboard.writeText(markdown.value)
    status.value = 'copied-markdown'
    fallback.value = ''
  } catch {
    // No clipboard access (an insecure page, or the browser said no): show the text to select instead.
    status.value = 'failed'
    fallback.value = markdown.value
  }
}

async function copyRich() {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      throw new Error('Rich copy is not supported here.')
    }
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html.value], { type: 'text/html' }),
        'text/plain': new Blob([plain.value], { type: 'text/plain' }),
      }),
    ])
    status.value = 'copied'
    fallback.value = ''
  } catch {
    // Rich copy isn't available (older browsers, or refused): the plain words still go, so nothing is lost.
    try {
      await navigator.clipboard.writeText(plain.value)
      status.value = 'copied'
      fallback.value = ''
    } catch {
      status.value = 'failed'
      fallback.value = plain.value
    }
  }
}
</script>

<template>
  <section id="publish" aria-labelledby="publish-heading" class="mt-12 border-t border-line pt-6">
    <h2 id="publish-heading" class="h3">Publish</h2>
    <Explain label="About publishing" class="mt-1">
      Copy the draft and paste it where you publish. Once it’s published, your idea stays here with
      its notes, reading list and drafts.
    </Explain>
    <div class="mt-4 flex flex-wrap items-center gap-2">
      <button type="button" class="btn btn-primary" :disabled="empty" @click="copyRich">
        Copy
      </button>
      <button type="button" class="btn btn-outline" :disabled="empty" @click="copyMarkdown">
        Copy as Markdown
      </button>
    </div>
    <p v-if="status !== 'idle'" role="status" class="meta mt-2">
      <template v-if="status === 'copied' || status === 'copied-markdown'">Copied</template>
      <template v-else-if="status === 'failed'">
        We couldn’t reach your clipboard. Select the text below and copy it.
      </template>
    </p>
    <div v-if="fallback" class="mt-3">
      <label class="sr-only" for="publish-fallback">The draft, to select and copy</label>
      <textarea
        id="publish-fallback"
        class="field !min-h-0 font-mono text-sm"
        rows="12"
        readonly
        :value="fallback"
        @focus="($event.target as HTMLTextAreaElement).select()"
      ></textarea>
    </div>
  </section>
</template>
