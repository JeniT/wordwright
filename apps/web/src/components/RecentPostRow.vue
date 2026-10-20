<script setup lang="ts">
import { computed } from 'vue'
import NewTabLink from './NewTabLink.vue'
import type { RecentPost } from '@wordwright/core'
import type { PostDecision } from '../lib/recent-posts'
import Icon from './Icon.vue'
import PublicationImage from './PublicationImage.vue'
import { vTip } from '../lib/tip'

/**
 * One post from a feed, with the decision to make about it (or how it was decided, and a way back). Shared by the
 * Scan page's list and the publication's landing page so the two can't drift apart.
 */
const props = defineProps<{
  post: RecentPost
  /** The feed's name and logo. */
  feedName: string
  feedIconUrl?: string | null
  feedIconSquare?: boolean
  busy: boolean
}>()
const emit = defineEmits<{ decide: [what: PostDecision] }>()
// Reconsidering undoes either decision, so the button says which.
const undoLabel = computed(() =>
  props.post.status === 'added' ? 'Take off the reading list' : 'Stop ignoring',
)

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
</script>

<template>
  <li class="flex gap-3 px-3 py-2">
    <PublicationImage
      :id="post.sourceId"
      :name="feedName"
      :image-url="feedIconUrl"
      :square="feedIconSquare"
      size="xs"
      kind="source"
      class="mt-0.5"
    />
    <!-- Decided: just the title, how it went, and a way back. -->
    <template v-if="post.status !== 'new'">
      <div class="flex min-w-0 flex-1 items-start gap-2">
        <span
          v-if="post.status === 'added'"
          class="font-bold text-ok"
          role="img"
          aria-label="In the reading list"
          >✓</span
        >
        <span v-else class="font-bold text-danger" role="img" aria-label="Ignored">✗</span>
        <span
          class="min-w-0 flex-1 break-words"
          :class="post.status === 'ignored' ? 'text-ink-soft' : ''"
          >{{ post.title }}
          <span class="text-sm text-ink-soft">
            · {{ feedName }} ·
            {{ post.status === 'added' ? 'in the reading list' : 'ignored' }}</span
          ></span
        >
      </div>
      <button
        v-tip="undoLabel"
        type="button"
        class="btn btn-sm btn-icon btn-ghost shrink-0"
        :disabled="busy"
        :aria-label="`${undoLabel}: ${post.title}`"
        @click="emit('decide', 'reconsider')"
      >
        <Icon name="undo" />
      </button>
    </template>
    <!-- Waiting for a decision: everything needed to make one. -->
    <template v-else>
      <div class="min-w-0 flex-1">
        <NewTabLink :href="post.url" class="break-words font-medium underline">{{
          post.title
        }}</NewTabLink>
        <p class="meta break-words">
          {{ feedName }}
          <template v-if="post.authors.length"> · {{ post.authors.join(', ') }}</template>
          <template v-if="post.publishedAt"> · {{ when(post.publishedAt) }}</template>
        </p>
        <p v-if="post.summary" class="line-clamp-2 break-words text-sm text-ink-soft">
          {{ post.summary }}
        </p>
      </div>
      <div class="flex shrink-0 items-start gap-2">
        <button
          v-tip="'Add to reading list'"
          type="button"
          class="btn btn-sm btn-icon btn-ghost"
          :disabled="busy"
          :aria-label="`Add to reading list: ${post.title}`"
          @click="emit('decide', 'add')"
        >
          <Icon name="check" />
        </button>
        <button
          v-tip="'Ignore'"
          type="button"
          class="btn btn-sm btn-icon btn-ghost"
          :disabled="busy"
          :aria-label="`Ignore: ${post.title}`"
          @click="emit('decide', 'ignore')"
        >
          <Icon name="close" />
        </button>
      </div>
    </template>
  </li>
</template>
