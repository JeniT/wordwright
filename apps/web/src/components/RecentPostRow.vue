<script setup lang="ts">
import type { RecentPost } from '@lfwa/core'
import type { PostDecision } from '../lib/recent-posts'
import Icon from './Icon.vue'
import ProfileImage from './ProfileImage.vue'

/**
 * One post from a feed, with the decision to make about it (or how it was decided, and a way back). Shared by the
 * Search page's list and the profile's landing page so the two can't drift apart.
 */
defineProps<{
  post: RecentPost
  /** The feed's name and logo. */
  feedName: string
  feedIconUrl?: string | null
  busy: boolean
}>()
const emit = defineEmits<{ decide: [what: PostDecision] }>()

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
</script>

<template>
  <li class="flex gap-3 px-3 py-2">
    <ProfileImage
      :id="post.sourceId"
      :name="feedName"
      :image-url="feedIconUrl"
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
          aria-label="On a reading list"
          >✓</span
        >
        <span v-else class="font-bold text-danger" role="img" aria-label="Ignored">✗</span>
        <span
          class="min-w-0 flex-1 break-words"
          :class="post.status === 'ignored' ? 'text-ink-soft' : ''"
          >{{ post.title }}
          <span class="text-sm text-ink-soft">
            · {{ feedName }} · {{ post.status === 'added' ? 'on a reading list' : 'ignored' }}</span
          ></span
        >
      </div>
      <button
        type="button"
        class="btn btn-sm btn-icon btn-quiet shrink-0"
        title="Reconsider"
        :disabled="busy"
        :aria-label="`Reconsider: ${post.title}`"
        @click="emit('decide', 'reconsider')"
      >
        <Icon name="undo" />
      </button>
    </template>
    <!-- Waiting for a decision: everything needed to make one. -->
    <template v-else>
      <div class="min-w-0 flex-1">
        <a
          :href="post.url"
          target="_blank"
          rel="noopener noreferrer"
          class="break-words font-medium underline"
        >
          {{ post.title }}<span class="sr-only"> (opens in a new tab)</span>
        </a>
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
          type="button"
          class="btn btn-sm btn-icon btn-quiet"
          title="Add to the reading list"
          :disabled="busy"
          :aria-label="`Add to the reading list: ${post.title}`"
          @click="emit('decide', 'add')"
        >
          <Icon name="check" />
        </button>
        <button
          type="button"
          class="btn btn-sm btn-icon btn-quiet"
          title="Ignore"
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
