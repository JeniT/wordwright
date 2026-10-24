<script setup lang="ts">
import { computed } from 'vue'
import { useMutation } from '@tanstack/vue-query'
import { RouterLink } from 'vue-router'
import type { Article } from '@wordwright/core'
import { errorMessage } from '../lib/api'
import { ARTICLE_DRAG_TYPE } from '../lib/note-drag'
import { nameList } from '../lib/note-label'
import { tagsUsedOn, useTagFilter } from '../lib/note-tags'
import DraftCard from './DraftCard.vue'
import NoteTags from './NoteTags.vue'
import TagFilter from './TagFilter.vue'

const props = defineProps<{
  publicationId: string
  ideaId: string
  articleList: readonly Article[]
  /** Puts a link to the item in the draft (asking first if it isn't marked read); rejects with a message if it fails. */
  insertLink: (item: Article) => Promise<void>
  /** The person may put links in the draft (only the draft's editor may). */
  canAdd: boolean
}>()

const inserting = useMutation({ mutationFn: (item: Article) => props.insertLink(item) })
const label = (item: Article) => item.title || item.url

const usedTags = computed(() => tagsUsedOn(props.articleList))
const { chosen: tagFilter, matches: matchesTags } = useTagFilter(usedTags)
const shown = computed(() => props.articleList.filter((item) => matchesTags(item)))
</script>

<template>
  <section aria-labelledby="draft-reading-heading">
    <!-- The tab beside the draft already says "Articles"; the heading is for screen readers moving by headings. -->
    <h2 id="draft-reading-heading" class="sr-only">Articles</h2>
    <p v-if="!articleList.length" class="text-ink-soft">
      Nothing in the articles yet.
      <RouterLink
        :to="{ name: 'idea-read', params: { publicationId, id: ideaId } }"
        class="underline"
      >
        Add to it on the idea page.
      </RouterLink>
    </p>
    <TagFilter v-model="tagFilter" :tags="usedTags" />
    <p v-if="articleList.length && !shown.length" class="text-ink-soft">
      No items have all these tags.
    </p>
    <ul v-else-if="shown.length" aria-label="Articles to add" class="space-y-2">
      <DraftCard
        v-for="item in shown"
        :key="item.id"
        :can-add="canAdd"
        :drag="{ type: ARTICLE_DRAG_TYPE, id: item.id }"
        :label="`“${label(item)}”`"
        :busy="inserting.isPending.value && inserting.variables.value?.id === item.id"
        @add="inserting.mutate(item)"
      >
        <p class="break-words">{{ label(item) }}</p>
        <p v-if="item.authors.length" class="text-xs text-ink-soft">
          by {{ nameList(item.authors) }}
        </p>
        <NoteTags :tags="item.tags" />
        <p v-if="!item.readAt" class="mt-1">
          <span class="chip chip-quiet">Not marked as read</span>
        </p>
      </DraftCard>
    </ul>
    <p v-if="inserting.isError.value" role="alert" class="mt-2 text-danger">
      {{ errorMessage(inserting.error.value) }}
    </p>
  </section>
</template>
