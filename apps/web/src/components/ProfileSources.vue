<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { Source } from '@lfwa/core'
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

const add = useMutation({
  mutationFn: (address: string) => api.addSource(props.profileId, address),
  onSuccess: async (added) => {
    url.value = ''
    notice.value = `Added ${nameOf(added)}`
    await queryClient.invalidateQueries({ queryKey: ['sources'] })
  },
})

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

      <form @submit.prevent="add.mutate(url)">
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
