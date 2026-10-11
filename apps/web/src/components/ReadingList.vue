<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { errorMessage } from '../lib/api'
import { useReadingList } from '../lib/reading'
import IdeaLinkItem from './IdeaLinkItem.vue'
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
