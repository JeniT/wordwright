<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import type { Source, SourceChoices } from '@wordwright/core'
import { computed, ref } from 'vue'
import { api, errorMessage } from '../lib/api'
import { invalidateRoots, useSources } from '../lib/queries'
import SourceItems from './SourceItems.vue'
import HoldButton from './HoldButton.vue'
import Icon from './Icon.vue'
import PublicationImage from './PublicationImage.vue'
import TextField from './TextField.vue'
import QueryState from './QueryState.vue'

const props = defineProps<{ publicationId: string }>()

const queryClient = useQueryClient()
const sources = useSources(() => props.publicationId)

const url = ref('')
const notice = ref('') // announced politely to screen readers after each change

/** What to call a source: its own title, or failing that its address without the "https://". */
const nameOf = (source: Source) => source.title ?? shortName(source.url)

// Alphabetical by the name shown: there is no order to keep, so a feed is easy to find as the list grows.
const sorted = computed(() =>
  [...(sources.data.value ?? [])].sort((a, b) =>
    nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' }),
  ),
)

// A website that offers several feeds comes back as choices instead of being added.
const choices = ref<SourceChoices['choices']>([])
const chosen = ref<string[]>([])
const choiceName = (c: SourceChoices['choices'][number]) => c.title ?? shortName(c.url)

const add = useMutation({
  mutationFn: (address: string) => api.addSource(props.publicationId, address),
  onSuccess: async (result) => {
    if ('choices' in result) {
      choices.value = result.choices
      chosen.value = []
      notice.value = `That site has ${result.choices.length} feeds. Choose which to add.`
      return
    }
    url.value = ''
    choices.value = []
    notice.value = `Added ${nameOf(result)}`
    await invalidateRoots(queryClient, 'sources')
  },
})

/** Adds each ticked feed in turn; those that fail stay on the page, with the reason. */
const addChosen = useMutation({
  mutationFn: async (addresses: string[]) => {
    const added: string[] = []
    const failed: { url: string; reason: string }[] = []
    for (const address of addresses) {
      try {
        const result = await api.addSource(props.publicationId, address)
        if ('choices' in result) throw new Error('That address offers more than one feed.')
        added.push(nameOf(result))
      } catch (err) {
        failed.push({ url: address, reason: errorMessage(err) })
      }
    }
    return { added, failed }
  },
  onSuccess: async ({ added, failed }) => {
    if (added.length) notice.value = `Added ${added.join(', ')}`
    choices.value = choices.value.filter((c) => failed.some((f) => f.url === c.url))
    chosen.value = chosen.value.filter((u) => failed.some((f) => f.url === u))
    if (!failed.length) url.value = ''
    await invalidateRoots(queryClient, 'sources')
  },
})
function submitAddress() {
  cancelChoice()
  add.mutate(url.value)
}
function cancelChoice() {
  choices.value = []
  chosen.value = []
  addChosen.reset()
}

const remove = useMutation({
  mutationFn: (source: Source) => api.removeSource(props.publicationId, source.id),
  onSuccess: async (_data, source) => {
    notice.value = `Removed ${nameOf(source)}`
    await invalidateRoots(queryClient, 'sources')
  },
})

/** "example.com/feed" is easier to scan than "https://example.com/feed". */
function shortName(address: string) {
  try {
    const { host, pathname, search } = new URL(address)
    return `${host}${pathname === '/' ? '' : pathname}${search}`
  } catch {
    return address
  }
}
</script>

<template>
  <section aria-label="Feeds">
    <p class="mb-4 text-ink-soft">RSS feeds to look through for things that could spark ideas.</p>

    <QueryState :query="sources" what="the feeds" loading="Loading feeds…">
      <form @submit.prevent="submitAddress">
        <TextField
          v-model="url"
          label="Add a feed"
          type="text"
          autocomplete="off"
          autocapitalize="none"
          :spellcheck="false"
          required
          hint="Paste an RSS link, or the address of a site that has one"
        />
        <button type="submit" class="btn btn-outline" :disabled="add.isPending.value">
          {{ add.isPending.value ? 'Reading the feed…' : 'Add feed' }}
        </button>
      </form>

      <form
        v-if="choices.length"
        class="my-4 rounded-ctl border border-line bg-surface p-4"
        @submit.prevent="addChosen.mutate(chosen)"
      >
        <fieldset>
          <legend class="mb-2 font-medium">
            That site has more than one feed. Which would you like?
          </legend>
          <div v-for="c in choices" :key="c.url" class="mb-2 flex items-start gap-2">
            <input
              :id="`choice-${c.url}`"
              v-model="chosen"
              type="checkbox"
              :value="c.url"
              :disabled="c.alreadyAdded || addChosen.isPending.value"
              class="mt-1"
            />
            <label :for="`choice-${c.url}`" class="min-w-0">
              <span class="break-words">{{ choiceName(c) }}</span>
              <span v-if="c.comments" class="text-sm text-ink-soft"> (comments)</span>
              <span v-if="c.alreadyAdded" class="text-sm text-ink-soft">
                (already in your list)</span
              >
              <span class="block break-all text-xs text-ink-soft">{{ shortName(c.url) }}</span>
            </label>
          </div>
        </fieldset>
        <div class="mt-3 flex gap-2">
          <button
            type="submit"
            class="btn btn-outline"
            :disabled="!chosen.length || addChosen.isPending.value"
          >
            {{
              addChosen.isPending.value
                ? 'Adding…'
                : chosen.length > 1
                  ? 'Add chosen feeds'
                  : 'Add chosen feed'
            }}
          </button>
          <button
            type="button"
            class="btn btn-neutral btn-sm"
            :disabled="addChosen.isPending.value"
            @click="cancelChoice"
          >
            Cancel
          </button>
        </div>
        <ul v-if="addChosen.data.value?.failed.length" role="alert" class="mt-2 text-danger">
          <li v-for="f in addChosen.data.value.failed" :key="f.url">
            {{ shortName(f.url) }}: {{ f.reason }}
          </li>
        </ul>
      </form>

      <p v-if="add.isError.value" role="alert" class="mt-2 text-danger">
        {{ errorMessage(add.error.value) }}
      </p>

      <p v-if="!sources.data.value?.length" class="mt-6 text-ink-soft">
        No feeds yet. Add one above.
      </p>
      <ul v-else class="panel mt-6 divide-y divide-line" aria-label="Your feeds">
        <li v-for="source in sorted" :key="source.id" class="flex items-start gap-3 p-3">
          <PublicationImage
            :id="source.id"
            :name="nameOf(source)"
            :image-url="source.iconUrl"
            :square="source.iconSquare"
            size="sm"
            kind="source"
          />
          <div class="min-w-0 flex-1">
            <p class="break-words font-medium">{{ nameOf(source) }}</p>
            <p v-if="source.description" class="line-clamp-2 break-words text-sm text-ink-soft">
              {{ source.description }}
            </p>
            <p class="break-all text-xs text-ink-soft" :title="source.url">
              {{ shortName(source.url) }}
            </p>
            <p v-if="source.lastError" class="text-sm text-danger">
              We couldn’t read this feed on the last try. Open its recent posts for details, or
              remove it.
            </p>
            <SourceItems :publication-id="publicationId" :source="source" :name="nameOf(source)" />
          </div>
          <HoldButton
            tip="Press and hold, or tap twice, to remove this feed"
            verb="Remove"
            class="btn btn-sm btn-icon btn-ghost btn-ghost-danger"
            :disabled="remove.isPending.value"
            :aria-label="`Remove ${nameOf(source)}`"
            @confirm="remove.mutate(source)"
          >
            <Icon name="remove" />
          </HoldButton>
        </li>
      </ul>
      <p v-if="remove.isError.value" role="alert" class="mt-2 text-danger">
        {{ errorMessage(remove.error.value) }}
      </p>
    </QueryState>
    <!-- Not role="status": the page already has one for "Saved", and pages should have one each. -->
    <p aria-live="polite" aria-atomic="true" class="sr-only">{{ notice }}</p>
  </section>
</template>
