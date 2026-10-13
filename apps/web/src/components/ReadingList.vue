<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { errorMessage } from '../lib/api'
import { useMove, useMoveDestination } from '../lib/move'
import { hasTag, tagsUsedOn } from '../lib/note-tags'
import { usePaging } from '../lib/paging'
import { useReadingList } from '../lib/reading'
import AddLinkForm from './AddLinkForm.vue'
import BulkTagPanel from './BulkTagPanel.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import IdeaLinkItem from './IdeaLinkItem.vue'
import ListToolbar from './ListToolbar.vue'
import MoveTo from './MoveTo.vue'
import PageNav from './PageNav.vue'
import SwitchField from './SwitchField.vue'
import TagFilter from './TagFilter.vue'
import QueryState from './QueryState.vue'

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
// under the finger, and can be switched back), until the list is shown again or the switch below is changed.
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
// Only the items with one tag, when the writer picks one. A tag nothing carries any more can't be what is shown.
const usedTags = computed(() => tagsUsedOn(list.links.value ?? []))
const tagFilter = ref<string | null>(null)
watch(usedTags, (tags) => {
  if (tagFilter.value && !tags.some((t) => t.toLowerCase() === tagFilter.value!.toLowerCase())) {
    tagFilter.value = null
  }
})
watch([showRead, tagFilter], () => {
  justRead.value = new Set()
  clearSelection()
  paging.first()
})
const readCount = computed(() => (list.links.value ?? []).filter((l) => l.readAt).length)
/** What is filtering the list, for the funnel to say while the filters are folded away. */
const filterSummary = computed(() => {
  const parts = [tagFilter.value, showRead.value ? 'including read' : null].filter(Boolean)
  return parts.length ? parts.join(' · ') : undefined
})
const shown = computed(() =>
  (list.links.value ?? []).filter(
    (l) => (!l.readAt || showRead.value || justRead.value.has(l.id)) && hasTag(l, tagFilter.value),
  ),
)

// ---- pages: filter first, then page. A new page or filter clears the selection, so what an action will touch is
// always on screen.
const paging = usePaging(() => shown.value, 'links')
const heading = useTemplateRef<HTMLElement>('heading')
watch(paging.page, clearSelection)
/** From the bottom of the list the next page starts a long way up, so go back to the top of it. */
function goFromBottom(step: -1 | 1) {
  paging.go(step)
  heading.value?.scrollIntoView?.({ block: 'start' })
  heading.value?.focus({ preventScroll: true }) // keyboard users continue from the top too
}

// ---- selecting items for a bulk action (Move, Remove)
const selected = ref<string[]>([])
function clearSelection() {
  selected.value = []
}
/** The selected items that still exist (one that was removed or filtered away is not counted). */
const chosen = computed(() =>
  shown.value.filter((l) => selected.value.includes(l.id)).map((l) => l.id),
)
const chosenOnPage = computed(
  () => paging.pageItems.value.filter((l) => selected.value.includes(l.id)).length,
)
function toggleSelected(id: string, on: boolean) {
  selected.value = on ? [...selected.value, id] : selected.value.filter((s) => s !== id)
}
const selectPage = (on: boolean) =>
  (selected.value = on ? paging.pageItems.value.map((l) => l.id) : [])
const selectEverything = () => (selected.value = shown.value.map((l) => l.id))

// ---- tagging the selected items together
const tagging = ref(false)
/** The tags the selected items carry (each spelled as first met), and on how many. */
const carried = computed(() => {
  const counts = new Map<string, { tag: string; count: number }>()
  for (const link of shown.value.filter((l) => selected.value.includes(l.id)))
    for (const tag of link.tags) {
      const entry = counts.get(tag.toLowerCase())
      if (entry) entry.count++
      else counts.set(tag.toLowerCase(), { tag, count: 1 })
    }
  return [...counts.values()]
})
const announcement = ref('')
function applyTags(change: { add: string[]; remove: string[] }) {
  const ids = chosen.value
  list.tagMany.mutate(
    { ids, ...change },
    {
      onSuccess: () => {
        announcement.value = `Tagged ${ids.length} ${ids.length === 1 ? 'link' : 'links'}.`
        tagging.value = false
      },
    },
  )
}
function toggleTagging() {
  moving.value = false
  tagging.value = !tagging.value
  list.tagMany.reset()
}

// ---- moving the selected items between the profile's own list and its ideas
const mover = useMove(() => props.profileId)
const dest = useMoveDestination(
  () => props.profileId,
  () => props.ideaId,
  'the profile’s reading list',
)
const moving = ref(false)
function toggleMoving() {
  tagging.value = false
  moving.value = !moving.value
  dest.reset()
  mover.moveReading.reset()
}
async function move() {
  const ids = chosen.value
  const target = await dest.resolve()
  if (!target) return
  mover.moveReading.mutate(
    { ids, from: props.ideaId, to: target.to, toName: target.name },
    {
      onSuccess: () => {
        moving.value = false
        clearSelection()
        dest.reset()
      },
    },
  )
}
const canMove = computed(
  () =>
    chosen.value.length > 0 &&
    dest.chosen &&
    !mover.moveReading.isPending.value &&
    !dest.makeIdea.isPending,
)

// ---- removing the selected items, once confirmed in a dialog (it is more than one thing)
const confirmingRemoveChosen = ref(false)
function removeChosen() {
  list.removeMany.mutate(chosen.value, {
    onSuccess: clearSelection,
    onSettled: () => (confirmingRemoveChosen.value = false),
  })
}
</script>

<template>
  <section aria-labelledby="links-heading" class="mb-10">
    <h2
      id="links-heading"
      ref="heading"
      tabindex="-1"
      class="mb-1 font-display text-xl font-semibold"
      :class="{ 'sr-only': quietHeading }"
    >
      Reading list
    </h2>
    <p class="mb-3 text-sm text-ink-soft">
      <template v-if="ideaId">
        Articles, papers or earlier posts that this idea builds on or responds to. Mark each one
        Read when you have read it, even if you read it somewhere else.
      </template>
      <template v-else>
        Things to read for this profile, before any one idea: read them, take notes, and later
        gather the notes into an idea. Links you add stay; links from your feeds go after a month
        unless you switch Keep on.
      </template>
    </p>

    <QueryState :query="list" what="the reading list" loading="Loading the reading list…">
      <p class="sr-only" aria-live="polite">{{ announcement }}</p>
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

      <p v-if="!list.links.value?.length" class="mb-4 text-ink-soft">
        Nothing on the reading list yet.
      </p>
      <template v-else>
        <PageNav
          v-if="paging.pageCount.value > 1"
          v-bind="paging.nav.value"
          label="Pages of the reading list, above the list"
          announce
          class="mb-3"
          @go="paging.go"
        />
        <div class="mb-4 overflow-hidden rounded-ctl border border-line bg-surface">
          <ListToolbar
            :page-size="paging.pageItems.value.length"
            :total="shown.length"
            :selected="chosen.length"
            :selected-on-page="chosenOnPage"
            noun="links"
            :can-filter="usedTags.length > 0 || readCount > 0"
            :filter-summary="filterSummary"
            @toggle-page="selectPage"
            @select-everything="selectEverything"
          >
            <template #filters>
              <TagFilter v-model="tagFilter" :tags="usedTags" noun="links" class="!mb-0" />
              <SwitchField
                v-if="readCount"
                v-model="showRead"
                :label="`Show read items (${readCount})`"
              />
            </template>
            <template #actions>
              <button
                type="button"
                class="btn btn-sm btn-neutral"
                :aria-expanded="tagging"
                :disabled="!chosen.length && !tagging"
                @click="toggleTagging"
              >
                Tag…
              </button>
              <button
                type="button"
                class="btn btn-sm btn-neutral"
                :aria-expanded="moving"
                :disabled="!chosen.length && !moving"
                @click="toggleMoving"
              >
                Move to…
              </button>
              <button
                type="button"
                class="btn btn-sm btn-danger"
                :disabled="!chosen.length || list.removeMany.isPending.value"
                :title="chosen.length ? undefined : 'Select links to remove them'"
                @click="confirmingRemoveChosen = true"
              >
                Remove{{ chosen.length ? ` ${chosen.length}` : '' }}
              </button>
            </template>
          </ListToolbar>
          <BulkTagPanel
            v-if="tagging"
            noun="link"
            :count="chosen.length"
            :carried="carried"
            :suggestions="usedTags"
            :pending="list.tagMany.isPending.value"
            :error="list.tagMany.isError.value ? errorMessage(list.tagMany.error.value) : undefined"
            @apply="applyTags"
            @cancel="toggleTagging"
          />
          <form
            v-if="moving"
            class="border-b border-line bg-sunken p-3"
            aria-label="Move the chosen links"
            @submit.prevent="move"
          >
            <p class="mb-2 text-sm text-ink-soft">
              Each goes with the notes you took from it, and keeps whether you have read it.
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
                    : `Move ${chosen.length} ${chosen.length === 1 ? 'item' : 'items'}`
                }}
              </button>
              <button type="button" class="btn btn-sm btn-neutral" @click="toggleMoving">
                Cancel
              </button>
            </div>
            <p v-if="mover.moveReading.isError.value" role="alert" class="mt-2 text-sm text-danger">
              {{ errorMessage(mover.moveReading.error.value) }}
            </p>
          </form>
          <ul v-if="paging.pageItems.value.length" class="divide-y divide-line">
            <IdeaLinkItem
              v-for="link in paging.pageItems.value"
              :key="link.id"
              :profile-id="profileId"
              :idea-id="ideaId"
              :link="link"
              :selected="selected.includes(link.id)"
              :known-tags="usedTags"
              @select="toggleSelected(link.id, $event)"
              @remove="list.remove.mutate(link.id)"
            />
          </ul>
          <p v-else class="px-4 py-3 text-ink-soft">Everything on the list has been read.</p>
        </div>
        <PageNav
          v-if="paging.pageCount.value > 1"
          v-bind="paging.nav.value"
          label="Pages of the reading list, below the list"
          class="mb-4"
          @go="goFromBottom"
        />
      </template>
      <p v-if="list.remove.isError.value" role="alert" class="mb-3 text-danger">
        Couldn't remove that link. Please try again.
      </p>
      <p v-if="list.removeMany.isError.value" role="alert" class="mb-3 text-danger">
        Couldn't remove all of those links. The ones that are left are still selected below; please
        try again.
      </p>

      <AddLinkForm :profile-id="profileId" :idea-id="ideaId" />
    </QueryState>
    <ConfirmDialog
      :open="confirmingRemoveChosen"
      :title="`Remove ${chosen.length} ${chosen.length === 1 ? 'link' : 'links'}?`"
      confirm-label="Yes, remove them"
      busy-label="Removing…"
      :busy="list.removeMany.isPending.value"
      @confirm="removeChosen"
      @cancel="confirmingRemoveChosen = false"
    >
      The selected links will be removed from the reading list. This can't be undone.
    </ConfirmDialog>
  </section>
</template>
