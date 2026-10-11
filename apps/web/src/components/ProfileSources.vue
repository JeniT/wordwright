<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { Source, SourceChoices } from '@lfwa/core'
import { ref } from 'vue'
import { api, errorMessage } from '../lib/api'
import ProfileImage from './ProfileImage.vue'
import ReorderableList from './ReorderableList.vue'
import TextField from './TextField.vue'

const props = defineProps<{ profileId: string }>()

const queryClient = useQueryClient()
const queryKey = ['sources', () => props.profileId] as const
const sources = useQuery({ queryKey, queryFn: () => api.listSources(props.profileId) })
const setList = (list: Source[]) => queryClient.setQueryData(['sources', props.profileId], list)

const url = ref('')
const notice = ref('') // announced politely to screen readers after each change

/** What to call a source: its own title, or failing that its address without the "https://". */
const nameOf = (source: Source) => source.title ?? shortName(source.url)

// A website that offers several feeds comes back as choices instead of being added.
const choices = ref<SourceChoices['choices']>([])
const chosen = ref<string[]>([])
const choiceName = (c: SourceChoices['choices'][number]) => c.title ?? shortName(c.url)

const add = useMutation({
  mutationFn: (address: string) => api.addSource(props.profileId, address),
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
    await queryClient.invalidateQueries({ queryKey: ['sources'] })
  },
})

/** Adds each ticked feed in turn; those that fail stay on the page, with the reason. */
const addChosen = useMutation({
  mutationFn: async (addresses: string[]) => {
    const added: string[] = []
    const failed: { url: string; reason: string }[] = []
    for (const address of addresses) {
      try {
        const result = await api.addSource(props.profileId, address)
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
    await queryClient.invalidateQueries({ queryKey: ['sources'] })
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
  mutationFn: (source: Source) => api.removeSource(props.profileId, source.id),
  onSuccess: async (_data, source) => {
    notice.value = `Removed ${nameOf(source)}`
    await queryClient.invalidateQueries({ queryKey: ['sources'] })
  },
})

const move = useMutation({
  mutationFn: (ids: string[]) => api.reorderSources(props.profileId, ids),
  onSuccess: setList,
  // The list on screen may be out of date (the 409 says so); show the server's.
  onError: () => queryClient.invalidateQueries({ queryKey: ['sources'] }),
})

/** Saves a new order; true if it was saved. */
async function saveOrder(ids: string[]) {
  try {
    await move.mutateAsync(ids)
  } catch {
    return false // the error is shown below
  }
  return true
}

/** "example.com/feed" is easier to scan than "https://example.com/feed". */
function shortName(address: string) {
  try {
    const { host, pathname, search } = new URL(address)
    return `${host}${pathname === '/' ? '' : pathname}${search}`
  } catch {
    return address
  }
}

const removeClass =
  'rounded border border-stone-300 bg-white px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'
</script>

<template>
  <section aria-labelledby="sources-heading">
    <h2 id="sources-heading" class="mb-1 font-serif text-xl font-semibold">Feeds</h2>
    <p class="mb-3 text-sm text-stone-600">
      RSS feeds to look through for things that could spark ideas. Posts from feeds higher in the
      list will be shown first: drag a feed by its grip, or use the arrow buttons, to change the
      order.
    </p>

    <p v-if="sources.isPending.value">Loading sources…</p>
    <div v-else-if="sources.isError.value" role="alert" class="text-red-700">
      <p>We couldn't load the sources. Check your connection and try again.</p>
      <button type="button" class="underline" @click="sources.refetch()">Try again</button>
    </div>
    <template v-else>
      <p v-if="!sources.data.value?.length" class="text-sm text-stone-700">
        No sources yet. Paste the address of a blog, newsletter or news feed below to start your
        list.
      </p>
      <ReorderableList
        v-else
        class="mb-4"
        :items="sources.data.value"
        :item-label="nameOf"
        :save="(ids) => saveOrder(ids)"
      >
        <template #default="{ item: source, index }">
          <ProfileImage
            :id="source.id"
            :name="nameOf(source)"
            :image-url="source.iconUrl"
            size="sm"
          />
          <div class="min-w-0 flex-1">
            <p class="break-words font-medium">
              <span class="sr-only">{{ index + 1 }}. </span>{{ nameOf(source) }}
            </p>
            <p v-if="source.description" class="line-clamp-2 break-words text-sm text-stone-700">
              {{ source.description }}
            </p>
            <p class="break-all text-xs text-stone-500" :title="source.url">
              {{ shortName(source.url) }}
            </p>
          </div>
        </template>
        <template #actions="{ item: source }">
          <button
            type="button"
            :class="removeClass"
            :disabled="remove.isPending.value"
            :aria-label="`Remove ${nameOf(source)}`"
            @click="remove.mutate(source)"
          >
            Remove
          </button>
        </template>
      </ReorderableList>

      <form @submit.prevent="submitAddress">
        <TextField
          v-model="url"
          label="Add a feed"
          type="text"
          autocomplete="off"
          autocapitalize="none"
          :spellcheck="false"
          required
          hint="Paste an RSS or Atom link, or the address of a site that has one, for example https://example.com/feed. It goes at the end of the list."
        />
        <button
          type="submit"
          class="rounded border border-accent px-3 py-2 text-sm text-accent disabled:opacity-60"
          :disabled="add.isPending.value"
        >
          {{ add.isPending.value ? 'Reading the feed…' : 'Add source' }}
        </button>
      </form>

      <form
        v-if="choices.length"
        class="mt-4 rounded border border-stone-200 bg-white p-4"
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
              <span v-if="c.comments" class="text-sm text-stone-600"> (comments)</span>
              <span v-if="c.alreadyAdded" class="text-sm text-stone-600">
                (already in your list)</span
              >
              <span class="block break-all text-xs text-stone-500">{{ shortName(c.url) }}</span>
            </label>
          </div>
        </fieldset>
        <div class="mt-3 flex gap-2">
          <button
            type="submit"
            class="rounded border border-accent px-3 py-2 text-sm text-accent disabled:opacity-60"
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
            class="rounded border border-stone-300 px-3 py-2 text-sm"
            :disabled="addChosen.isPending.value"
            @click="cancelChoice"
          >
            Cancel
          </button>
        </div>
        <ul v-if="addChosen.data.value?.failed.length" role="alert" class="mt-2 text-red-700">
          <li v-for="f in addChosen.data.value.failed" :key="f.url">
            {{ shortName(f.url) }}: {{ f.reason }}
          </li>
        </ul>
      </form>

      <p v-if="add.isError.value" role="alert" class="mt-2 text-red-700">
        {{ errorMessage(add.error.value) }}
      </p>
      <p v-if="remove.isError.value" role="alert" class="mt-2 text-red-700">
        {{ errorMessage(remove.error.value) }}
      </p>
      <p v-if="move.isError.value" role="alert" class="mt-2 text-red-700">
        {{ errorMessage(move.error.value) }}
      </p>
    </template>
    <!-- Not role="status": the settings page already has one for "Saved", and pages should have one each. -->
    <p aria-live="polite" aria-atomic="true" class="sr-only">{{ notice }}</p>
  </section>
</template>
