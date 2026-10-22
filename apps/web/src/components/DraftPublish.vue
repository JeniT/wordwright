<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useSavedValue } from '../lib/forms'
import { useInlineEdit } from '../lib/inline-edit'
import { renderMarkdown } from '../lib/markdown'
import { useSetPublished } from '../lib/queries'
import { vTip } from '../lib/tip'
import HeadingRow from './HeadingRow.vue'
import Icon from './Icon.vue'
import NewTabLink from './NewTabLink.vue'
import PublishedChip from './PublishedChip.vue'
import SaveStatus from './SaveStatus.vue'
import SwitchField from './SwitchField.vue'

/**
 * The end of the Draft page: the draft as it stands, ready to be taken elsewhere. **Copy** puts it on the clipboard
 * as rich text (so headings, links and emphasis survive a paste into an editor or an email) with plain text beside
 * it for places that take only that; **Copy as Markdown** puts the Markdown itself, title first as a heading. Both
 * copy what is on the page now, saved or not. If the browser won't let us reach the clipboard the text is shown to
 * select instead. Publishing straight to a newsletter would add its own buttons here; none exist yet.
 *
 * Below the copy buttons the editor says when they have published it (#311), and may give a link to the post. That
 * takes the draft out of Keep writing; it is the writer's own marker and nothing checks it.
 */
const props = defineProps<{
  publicationId: string
  draftId: string
  title: string
  body: string
  publishedAt: string | null
  publishedUrl: string | null
}>()

const setPublished = useSetPublished(
  () => props.publicationId,
  () => props.draftId,
)
const publishedSwitch = useTemplateRef<InstanceType<typeof SwitchField>>('publishedSwitch')
const link = useSavedValue(
  () => props.publishedUrl ?? '',
  '',
  () => props.draftId,
)
function toggle(on: boolean) {
  setPublished.mutate({ published: on }, { onError: () => publishedSwitch.value?.revert() })
}

// Once there is a link the form folds away behind an edit button, so the saved state is just the chip and the link.
const editButton = useTemplateRef<HTMLButtonElement>('editButton')
const linkForm = useTemplateRef<HTMLFormElement>('linkForm')
const {
  editing,
  start: startEditing,
  stop: stopEditing,
} = useInlineEdit<'link'>({
  field: () => linkForm.value?.querySelector('input'),
  trigger: () => editButton.value,
})
watch(
  () => [props.draftId, props.publishedAt],
  () => {
    editing.value = null
  },
)
const showForm = computed(() => !props.publishedUrl || editing.value !== null)
function saveLink() {
  setPublished.mutate({ published: true, url: link.value }, { onSuccess: () => void stopEditing() })
}
function cancelEditing() {
  link.value = props.publishedUrl ?? ''
  void stopEditing()
}

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
    <HeadingRow label="About publishing" class="!mb-0">
      <h2 id="publish-heading" class="h3">Publish</h2>
      <template #explain>
        Copy the draft as either rich text or Markdown to paste wherever you publish. Marking it
        published means you won’t be prompted to keep writing it.
      </template>
    </HeadingRow>
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
    <div class="mt-6">
      <SwitchField
        ref="publishedSwitch"
        :model-value="!!publishedAt"
        label="I’ve published this draft"
        :disabled="setPublished.isPending.value"
        @update:model-value="toggle"
      />
      <template v-if="publishedAt">
        <p class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <PublishedChip :published-at="publishedAt" />
          <span v-if="publishedUrl && !showForm" class="inline-flex items-center gap-1">
            <NewTabLink :href="publishedUrl" class="link">View post</NewTabLink>
            <button
              ref="editButton"
              v-tip="'Edit link'"
              type="button"
              class="btn btn-sm btn-icon btn-ghost"
              aria-label="Edit link to the published post"
              @click="startEditing('link')"
            >
              <Icon name="edit" />
            </button>
          </span>
        </p>
        <form
          v-if="showForm"
          ref="linkForm"
          class="mt-3 flex flex-wrap items-end gap-2"
          @submit.prevent="saveLink"
          @keydown.esc="publishedUrl && cancelEditing()"
        >
          <div class="min-w-0 flex-1 basis-64">
            <label for="published-url" class="mb-1 block text-sm font-medium"
              >Link to the published post <span class="meta font-normal">(optional)</span></label
            >
            <input
              id="published-url"
              v-model="link"
              type="url"
              class="field"
              placeholder="https://"
              autocomplete="off"
            />
          </div>
          <button type="submit" class="btn btn-outline" :disabled="setPublished.isPending.value">
            Save link
          </button>
        </form>
      </template>
      <div class="mt-2"><SaveStatus :mutation="setPublished" /></div>
    </div>
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
