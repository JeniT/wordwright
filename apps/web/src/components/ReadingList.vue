<script setup lang="ts">
import { ref } from 'vue'
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
      <ul
        v-if="list.links.value?.length"
        class="mb-4 divide-y divide-line rounded-ctl border border-line bg-surface"
      >
        <IdeaLinkItem
          v-for="link in list.links.value"
          :key="link.id"
          :profile-id="profileId"
          :idea-id="ideaId"
          :link="link"
          @remove="list.remove.mutate(link.id)"
        />
      </ul>
      <p v-else class="mb-4 text-ink-soft">Nothing on the reading list yet.</p>
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
