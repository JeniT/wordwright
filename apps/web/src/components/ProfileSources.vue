<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { Source } from '@lfwa/core'
import { nextTick, ref } from 'vue'
import { api, errorMessage } from '../lib/api'
import ProfileImage from './ProfileImage.vue'
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
async function saveOrder(ids: string[], source: Source) {
  try {
    await move.mutateAsync(ids)
  } catch {
    return false // the error is shown below
  }
  notice.value = `Moved ${nameOf(source)} to position ${ids.indexOf(source.id) + 1} of ${ids.length}`
  return true
}

const currentIds = () => (sources.data.value ?? []).map((s) => s.id)

// ---- buttons (the keyboard route; also the way to reorder on a touch screen)
async function moveBy(source: Source, offset: -1 | 1) {
  const ids = currentIds()
  const from = ids.indexOf(source.id)
  const to = from + offset
  if (from < 0 || to < 0 || to >= ids.length) return
  ids.splice(to, 0, ...ids.splice(from, 1))
  if (!(await saveOrder(ids, source))) return
  // The rows are re-rendered in their new places; keep keyboard focus on the same source. At the
  // end of the list the button just used is disabled, so focus the opposite one instead.
  await nextTick()
  const button = (dir: 'up' | 'down') =>
    document.querySelector<HTMLButtonElement>(`[data-move="${source.id}-${dir}"]`)
  const wanted = button(offset === -1 ? 'up' : 'down')
  ;(wanted && !wanted.disabled ? wanted : button(offset === -1 ? 'down' : 'up'))?.focus()
}

// ---- dragging (the mouse route)
const draggingId = ref<string | null>(null)
/** The row the pointer is over while dragging, and which half of it. */
const over = ref<{ id: string; after: boolean } | null>(null)

function onDragStart(event: DragEvent, source: Source) {
  draggingId.value = source.id
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', source.url) // Firefox only starts a drag if there is data
  // Only the grip is draggable, but the whole row is what moves, so show the whole row.
  const row = (event.currentTarget as HTMLElement).closest('li')
  if (row) event.dataTransfer.setDragImage(row, 16, 16)
}

function onDragOver(event: DragEvent, source: Source) {
  if (!draggingId.value) return // something else (a file, some text) is being dragged
  event.preventDefault() // allows dropping here
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  over.value = { id: source.id, after: event.clientY > rect.top + rect.height / 2 }
}

async function onDrop(event: DragEvent) {
  event.preventDefault()
  const dragged = (sources.data.value ?? []).find((s) => s.id === draggingId.value)
  const target = over.value
  endDrag()
  if (!dragged || !target || target.id === dragged.id) return
  const ids = currentIds().filter((id) => id !== dragged.id)
  const at = ids.indexOf(target.id) + (target.after ? 1 : 0)
  ids.splice(at, 0, dragged.id)
  if (ids.join() === currentIds().join()) return
  await saveOrder(ids, dragged)
}

function endDrag() {
  draggingId.value = null
  over.value = null
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

const buttonClass =
  'rounded border border-stone-300 bg-white px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'
</script>

<template>
  <section aria-labelledby="sources-heading">
    <h2 id="sources-heading" class="mb-1 font-serif text-xl font-semibold">Idea sources</h2>
    <p class="mb-3 text-sm text-stone-600">
      RSS feeds to look through for articles that could spark ideas. Posts from sources higher in
      the list will be shown first: drag a source by its grip, or use the arrow buttons, to change
      the order.
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
      <ol v-else class="mb-4 divide-y divide-stone-200 rounded border border-stone-200 bg-white">
        <li
          v-for="(source, index) in sources.data.value"
          :key="source.id"
          class="flex flex-wrap items-center gap-x-3 gap-y-2 border-y-2 border-transparent px-3 py-2"
          :class="{
            'opacity-50': draggingId === source.id,
            'border-t-accent': over?.id === source.id && !over.after && draggingId !== source.id,
            'border-b-accent': over?.id === source.id && over.after && draggingId !== source.id,
          }"
          @dragover="onDragOver($event, source)"
          @drop="onDrop"
        >
          <span
            class="cursor-grab select-none text-stone-500"
            draggable="true"
            title="Drag to change the order"
            aria-hidden="true"
            data-testid="grip"
            @dragstart="onDragStart($event, source)"
            @dragend="endDrag"
          >
            ⠿
          </span>
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
          <span class="flex shrink-0 gap-1">
            <button
              type="button"
              :class="buttonClass"
              :data-move="`${source.id}-up`"
              :disabled="index === 0 || move.isPending.value"
              :aria-label="`Move ${nameOf(source)} up`"
              @click="moveBy(source, -1)"
            >
              ↑
            </button>
            <button
              type="button"
              :class="buttonClass"
              :data-move="`${source.id}-down`"
              :disabled="index === sources.data.value.length - 1 || move.isPending.value"
              :aria-label="`Move ${nameOf(source)} down`"
              @click="moveBy(source, 1)"
            >
              ↓
            </button>
            <button
              type="button"
              :class="buttonClass"
              :disabled="remove.isPending.value"
              :aria-label="`Remove ${nameOf(source)}`"
              @click="remove.mutate(source)"
            >
              Remove
            </button>
          </span>
        </li>
      </ol>

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
