<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import type { IdeaLink } from '@wordwright/core'
import { RouterLink } from 'vue-router'
import { errorMessage } from '../lib/api'
import { useMove, useMoveDestination } from '../lib/move'
import { tagsUsedOn, useTagFilter } from '../lib/note-tags'
import { usePaging } from '../lib/paging'
import { useReadingList } from '../lib/reading'
import AddLinkForm from './AddLinkForm.vue'
import BulkTagFields from './BulkTagFields.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import IdeaLinkItem from './IdeaLinkItem.vue'
import ListToolbar from './ListToolbar.vue'
import MoveFields from './MoveFields.vue'
import PageNav from './PageNav.vue'
import SwitchField from './SwitchField.vue'
import TagFilter from './TagFilter.vue'
import QueryState from './QueryState.vue'

/**
 * The reading list of an idea, or (no `ideaId`) of the publication: a box to add an item, then the items. A title
 * opens the item's own page, where notes are taken from it; the host name under it opens the article itself.
 */
const props = defineProps<{
  publicationId: string
  ideaId: string | null
}>()
const list = useReadingList(() => ({ publicationId: props.publicationId, ideaId: props.ideaId }))

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
// Only the items with every chosen tag. A tag nothing carries any more can't be what is shown.
const usedTags = computed(() => tagsUsedOn(list.links.value ?? []))
const { chosen: tagFilter, matches: matchesTags } = useTagFilter(usedTags)
watch([showRead, tagFilter], () => {
  justRead.value = new Set()
  clearSelection()
  paging.first()
})
/** A new item is unread and untagged: show it, whatever was filtering the list. */
function showAdded() {
  tagFilter.value = []
  paging.first()
}
const readCount = computed(() => (list.links.value ?? []).filter((l) => l.readAt).length)
/** What is filtering the list, for the funnel to say while the filters are folded away. */
const filterSummary = computed(() => {
  const parts = [...tagFilter.value, showRead.value ? 'including read' : null].filter(Boolean)
  return parts.length ? parts.join(' · ') : undefined
})
const shown = computed(() =>
  (list.links.value ?? []).filter(
    (l) => (!l.readAt || showRead.value || justRead.value.has(l.id)) && matchesTags(l),
  ),
)

// ---- pages: filter first, then page. A new page or filter clears the selection, so what an action will touch is
// always on screen.
const paging = usePaging(() => shown.value, 'items')
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
const tagAdd = ref<string[]>([])
const tagRemove = ref<string[]>([])
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
function applyTags() {
  const ids = chosen.value
  list.tagMany.mutate(
    { ids, add: tagAdd.value, remove: tagRemove.value },
    {
      onSuccess: () => {
        announcement.value = `Tagged ${ids.length} ${ids.length === 1 ? 'item' : 'items'}.`
        tagging.value = false
      },
    },
  )
}
function toggleTagging() {
  moving.value = false
  tagging.value = !tagging.value
  tagAdd.value = []
  tagRemove.value = []
  list.tagMany.reset()
}

// ---- moving the selected items between the publication's own list and its ideas
const mover = useMove(() => props.publicationId)
const dest = useMoveDestination(
  () => props.publicationId,
  () => props.ideaId,
  'the publication’s reading list',
)
const moving = ref(false)
/** An item whose own Move button was pressed: its dialog is open, and it alone moves (whatever is selected). */
const movingOne = ref<IdeaLink | null>(null)
function toggleMoving() {
  tagging.value = false
  moving.value = !moving.value
  dest.reset()
  mover.moveReading.reset()
}
function startMovingOne(link: IdeaLink) {
  tagging.value = false
  moving.value = false
  dest.reset()
  mover.moveReading.reset()
  movingOne.value = link
}
function stopMovingOne() {
  movingOne.value = null
  dest.reset()
}
async function move() {
  const ids = movingOne.value ? [movingOne.value.id] : chosen.value
  const target = await dest.resolve()
  if (!target) return
  mover.moveReading.mutate(
    {
      ids,
      from: props.ideaId,
      to: target.to,
      toPublicationId: target.toPublicationId,
      toName: target.name,
    },
    {
      onSuccess: () => {
        if (!movingOne.value) clearSelection()
        moving.value = false
        movingOne.value = null
        dest.reset()
      },
    },
  )
}
const canMove = computed(
  () =>
    (!!movingOne.value || chosen.value.length > 0) &&
    dest.chosen &&
    !mover.moveReading.isPending.value &&
    !dest.makeIdea.isPending,
)

// ---- the header's form (Tag… or Move to…) and its tick and cross
const formOpen = computed(() => tagging.value || moving.value)
const plural = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`
const confirmLabel = computed(() =>
  tagging.value
    ? list.tagMany.isPending.value
      ? 'Tagging…'
      : `Tag ${chosen.value.length} ${chosen.value.length === 1 ? 'item' : 'items'}`
    : mover.moveReading.isPending.value || dest.makeIdea.isPending
      ? 'Moving…'
      : `Move ${plural(chosen.value.length)}`,
)
const canConfirm = computed(() =>
  tagging.value
    ? chosen.value.length > 0 &&
      !list.tagMany.isPending.value &&
      tagAdd.value.length + tagRemove.value.length > 0
    : canMove.value,
)
function confirmForm() {
  if (tagging.value) applyTags()
  else void move()
}
function cancelForm() {
  if (tagging.value) toggleTagging()
  else if (moving.value) toggleMoving()
}

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
    <QueryState :query="list" what="the reading list" loading="Loading the reading list…">
      <p class="sr-only" aria-live="polite">{{ announcement }}</p>
      <AddLinkForm
        class="mb-6"
        :publication-id="publicationId"
        :idea-id="ideaId"
        @added="showAdded"
      />
      <h2
        id="links-heading"
        ref="heading"
        tabindex="-1"
        class="mb-1 font-display text-xl font-semibold"
      >
        Reading list
      </h2>
      <p v-if="ideaId" class="mb-3 text-sm text-ink-soft">
        Articles, papers or earlier posts that this idea builds on or responds to. Mark each one
        Read when you have read it, even if you read it somewhere else.
      </p>
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
        <template v-if="ideaId">Nothing to read yet. Add a web address above.</template>
        <template v-else>
          Nothing to read yet. Add a web address above, or find something in
          <RouterLink :to="{ name: 'scan', params: { publicationId } }" class="underline">
            Scan</RouterLink
          >.
        </template>
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
        <p v-if="shown.some((l) => l.why)" class="mb-3 text-sm">
          <span class="bg-mark"
            >Highlighted text is your AI’s reason for suggesting this item.</span
          >
        </p>
        <div class="mb-4 overflow-hidden rounded-ctl border border-line bg-surface">
          <ListToolbar
            :page-size="paging.pageItems.value.length"
            :total="shown.length"
            :selected="chosen.length"
            :selected-on-page="chosenOnPage"
            noun="items"
            :can-filter="usedTags.length > 0 || readCount > 0"
            :filter-summary="filterSummary"
            :form-open="formOpen"
            :confirm-label="confirmLabel"
            :can-confirm="canConfirm"
            @toggle-page="selectPage"
            @select-everything="selectEverything"
            @confirm="confirmForm"
            @cancel="cancelForm"
          >
            <template #filters>
              <TagFilter v-model="tagFilter" :tags="usedTags" class="!mb-0" />
              <SwitchField
                v-if="readCount"
                v-model="showRead"
                compact
                :label="`Show read items (${readCount})`"
              />
            </template>
            <template #actions>
              <button type="button" class="btn btn-sm btn-neutral" @click="toggleTagging">
                Tag…
              </button>
              <button type="button" class="btn btn-sm btn-neutral" @click="toggleMoving">
                Move to…
              </button>
              <button
                type="button"
                class="btn btn-sm btn-danger"
                :disabled="list.removeMany.isPending.value"
                @click="confirmingRemoveChosen = true"
              >
                Remove {{ chosen.length }}
              </button>
            </template>
            <template #form>
              <BulkTagFields
                v-if="tagging"
                v-model:add="tagAdd"
                v-model:remove="tagRemove"
                noun="item"
                :count="chosen.length"
                :carried="carried"
                :suggestions="usedTags"
              />
              <MoveFields
                v-else
                :dest="dest"
                :from-idea="!!ideaId"
                publication-label="The publication’s reading list"
                :allow-new="!ideaId"
                :count="chosen.length"
                noun="item"
              />
              <p
                v-if="tagging ? list.tagMany.isError.value : mover.moveReading.isError.value"
                role="alert"
                class="mt-1 text-sm text-danger"
              >
                {{
                  errorMessage(tagging ? list.tagMany.error.value : mover.moveReading.error.value)
                }}
              </p>
            </template>
          </ListToolbar>
          <ul v-if="paging.pageItems.value.length" class="divide-y divide-line">
            <IdeaLinkItem
              v-for="link in paging.pageItems.value"
              :key="link.id"
              :publication-id="publicationId"
              :idea-id="ideaId"
              :link="link"
              :selected="selected.includes(link.id)"
              :known-tags="usedTags"
              @select="toggleSelected(link.id, $event)"
              @remove="list.remove.mutate(link.id)"
              @move="startMovingOne(link)"
            />
          </ul>
          <p v-else class="px-4 py-3 text-ink-soft">
            {{
              tagFilter.length
                ? 'No items have all these tags.'
                : 'Everything on the list has been read.'
            }}
          </p>
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
        Sorry, we couldn’t remove that item. Please try again.
      </p>
      <p v-if="list.removeMany.isError.value" role="alert" class="mb-3 text-danger">
        Sorry, we couldn’t remove all of those items. The ones that are left are still selected
        below. Please try again.
      </p>
    </QueryState>
    <ConfirmDialog
      :open="!!movingOne"
      :title="movingOne ? `Move ${movingOne.title || movingOne.url}` : ''"
      :confirm-label="
        mover.moveReading.isPending.value || dest.makeIdea.isPending ? 'Moving…' : 'Move item'
      "
      confirm-tone="primary"
      :can-confirm="canMove"
      :busy="mover.moveReading.isPending.value || dest.makeIdea.isPending"
      busy-label="Moving…"
      @confirm="move"
      @cancel="stopMovingOne"
    >
      <MoveFields
        :dest="dest"
        :from-idea="!!ideaId"
        publication-label="The publication’s reading list"
        :allow-new="!ideaId"
      />
      <p v-if="mover.moveReading.isError.value" role="alert" class="mt-2 text-danger">
        {{ errorMessage(mover.moveReading.error.value) }}
      </p>
    </ConfirmDialog>
    <ConfirmDialog
      :open="confirmingRemoveChosen"
      :title="`Remove ${chosen.length} ${chosen.length === 1 ? 'item' : 'items'}?`"
      :confirm-label="`Remove ${plural(chosen.length)}`"
      busy-label="Removing…"
      :busy="list.removeMany.isPending.value"
      @confirm="removeChosen"
      @cancel="confirmingRemoveChosen = false"
    >
      The selected items will be removed from the reading list. This can’t be undone.
    </ConfirmDialog>
  </section>
</template>
