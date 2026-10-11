<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { errorMessage } from '../lib/api'
import { useMove, useMoveDestination } from '../lib/move'
import { useReadingList } from '../lib/reading'
import IdeaLinkItem from './IdeaLinkItem.vue'
import MoveTo from './MoveTo.vue'
import TextField from './TextField.vue'

/**
 * The reading list of an idea, or (no `ideaId`) of the profile: the items, with a box to add one. The items open
 * on a page of their own (`Take notes`) where notes are taken from them.
 */
const props = defineProps<{
  profileId: string
  ideaId: string | null
  /** The page already has this as its title; keep the heading for screen readers only. */
  quietHeading?: boolean
}>()
const list = useReadingList(() => ({ profileId: props.profileId, ideaId: props.ideaId }))

// Read items are out of the way by default. One marked read during this visit stays in view (so it doesn't vanish
// under the finger, and can be unticked), until the list is shown again or the tick below is changed.
const showRead = ref(false)
const justRead = ref(new Set<string>())
let known: Map<string, boolean> | null = null
watch(
  () => list.links.value,
  (links) => {
    if (!links) return
    if (known) {
      for (const l of links) if (l.readAt && known.get(l.id) === false) justRead.value.add(l.id)
    }
    known = new Map(links.map((l) => [l.id, !!l.readAt]))
  },
  { immediate: true },
)
watch(showRead, () => (justRead.value = new Set()))
const readCount = computed(() => (list.links.value ?? []).filter((l) => l.readAt).length)
const shown = computed(() =>
  (list.links.value ?? []).filter((l) => !l.readAt || showRead.value || justRead.value.has(l.id)),
)
/** Read items that are out of sight right now. */
const hiddenCount = computed(() => (list.links.value?.length ?? 0) - shown.value.length)

// ---- moving items between the profile's own list and its ideas
const mover = useMove(() => props.profileId)
const dest = useMoveDestination(
  () => props.profileId,
  () => props.ideaId,
  'the profile’s reading list',
)
const selecting = ref(false)
const selected = ref<string[]>([])
function toggleSelecting() {
  selecting.value = !selecting.value
  selected.value = []
  dest.reset()
  mover.moveReading.reset()
}
function toggleSelected(id: string, on: boolean) {
  selected.value = on ? [...selected.value, id] : selected.value.filter((s) => s !== id)
}
async function move() {
  const ids = selected.value
  const target = await dest.resolve()
  if (!target) return
  mover.moveReading.mutate(
    { ids, from: props.ideaId, to: target.to, toName: target.name },
    {
      onSuccess: () => {
        selecting.value = false
        selected.value = []
        dest.reset()
      },
    },
  )
}
const canMove = computed(
  () =>
    selected.value.length > 0 &&
    dest.chosen &&
    !mover.moveReading.isPending.value &&
    !dest.makeIdea.isPending,
)

const linkUrl = ref('')
// On failure what was typed stays in the field, with the reason shown under it.
function add() {
  list.add.mutate(linkUrl.value, { onSuccess: () => (linkUrl.value = '') })
}
</script>

<template>
  <section aria-labelledby="links-heading" class="mb-10">
    <h2
      id="links-heading"
      class="mb-1 font-display text-xl font-semibold"
      :class="{ 'sr-only': quietHeading }"
    >
      Reading list
    </h2>
    <p class="mb-3 text-sm text-ink-soft">
      <template v-if="ideaId">
        Articles, papers or earlier posts that this idea builds on or responds to. Tick each one off
        once you have read it, even if you read it somewhere else.
      </template>
      <template v-else>
        Things to read for this profile, before any one idea. Read them, take notes from them, and
        later gather the notes into an idea. Tick each one off once you have read it, even if you
        read it somewhere else. There is no limit to the list, so it can keep up with your feeds:
        what you haven't ticked <strong>Keep</strong> for is removed a month after it was added,
        quietly. An item you have taken notes from is never removed.
      </template>
    </p>

    <p v-if="list.isPending.value">Loading the reading list…</p>
    <div v-else-if="list.isError.value" role="alert" class="mb-4">
      <p class="text-danger">We couldn't load the reading list.</p>
      <button type="button" class="btn btn-outline mt-2" @click="list.refetch()">Try again</button>
    </div>
    <template v-else>
      <label v-if="readCount" class="mb-2 flex items-center gap-2 text-sm">
        <input v-model="showRead" type="checkbox" class="size-4 accent-accent" />
        Show read items ({{ readCount }})
      </label>
      <div v-if="list.links.value?.length" class="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="btn btn-sm btn-neutral"
          :aria-pressed="selecting"
          @click="toggleSelecting"
        >
          {{ selecting ? 'Stop moving' : 'Move items' }}
        </button>
      </div>
      <form
        v-if="selecting"
        class="panel-sunken mb-3 p-3"
        aria-label="Move the chosen items"
        @submit.prevent="move"
      >
        <p class="mb-2 text-sm text-ink-soft">
          Tick the items to move. Each goes with the notes you took from it, and keeps whether you
          have read it.
        </p>
        <MoveTo
          v-model:destination="dest.destination"
          v-model:new-idea-name="dest.newIdeaName"
          :dest="dest"
          :from-idea="!!ideaId"
          profile-label="The profile’s reading list"
          :allow-new="!ideaId"
          new-idea-hint="In your own words. The items you move become its reading list."
        />
        <div class="flex flex-wrap items-center gap-2">
          <button type="submit" class="btn btn-sm btn-primary" :disabled="!canMove">
            {{
              mover.moveReading.isPending.value || dest.makeIdea.isPending
                ? 'Moving…'
                : `Move ${selected.length} ${selected.length === 1 ? 'item' : 'items'}`
            }}
          </button>
        </div>
        <p v-if="mover.moveReading.isError.value" role="alert" class="mt-2 text-sm text-danger">
          {{ errorMessage(mover.moveReading.error.value) }}
        </p>
      </form>
      <div
        v-if="mover.outcome.value"
        role="status"
        class="callout callout-ok mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
      >
        <span>{{ mover.outcome.value.text }}</span>
        <button
          v-if="mover.outcome.value.undo"
          type="button"
          class="btn btn-sm btn-neutral"
          :disabled="mover.undoMove.isPending.value"
          @click="mover.outcome.value.undo()"
        >
          Undo
        </button>
        <button type="button" class="underline" @click="mover.dismiss()">Dismiss</button>
      </div>
      <p v-if="mover.undoMove.isError.value" role="alert" class="mb-3 text-sm text-danger">
        {{ errorMessage(mover.undoMove.error.value) }}
      </p>
      <ul
        v-if="shown.length"
        class="mb-4 divide-y divide-line rounded-ctl border border-line bg-surface"
      >
        <IdeaLinkItem
          v-for="link in shown"
          :key="link.id"
          :profile-id="profileId"
          :idea-id="ideaId"
          :link="link"
          :selecting="selecting"
          :selected="selected.includes(link.id)"
          @select="toggleSelected(link.id, $event)"
          @remove="list.remove.mutate(link.id)"
        />
      </ul>
      <p v-else-if="!list.links.value?.length" class="mb-4 text-ink-soft">
        Nothing on the reading list yet.
      </p>
      <p v-else class="mb-4 text-ink-soft">Everything on the list has been read.</p>
      <p v-if="hiddenCount" class="mb-4 text-sm text-ink-soft">
        {{ hiddenCount }} read {{ hiddenCount === 1 ? 'item is' : 'items are' }} hidden.
      </p>
      <p v-if="list.remove.isError.value" role="alert" class="mb-3 text-danger">
        Couldn't remove that link. Please try again.
      </p>

      <form @submit.prevent="add">
        <TextField
          v-model="linkUrl"
          label="Web address"
          required
          autocomplete="off"
          autocapitalize="none"
          :spellcheck="false"
          :invalid="list.add.isError.value"
          :hint="
            list.add.isError.value
              ? errorMessage(list.add.error.value)
              : 'For example, https://example.org/article. We look up its title for you.'
          "
          @update:model-value="list.add.isError.value && list.add.reset()"
        />
        <button type="submit" class="btn btn-outline" :disabled="list.add.isPending.value">
          {{ list.add.isPending.value ? 'Adding…' : 'Add link' }}
        </button>
      </form>
    </template>
  </section>
</template>
