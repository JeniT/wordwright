<script setup lang="ts">
import { computed } from 'vue'
import type { ResearchItem } from '@wordwright/core'
import type { PostDecision } from '../lib/recent-posts'
import { vTip } from '../lib/tip'
import Icon from './Icon.vue'
import NewTabLink from './NewTabLink.vue'

/**
 * One page your AI suggested, with the decision to make about it (or how it was decided, and a way back). Laid out
 * like a post on the Search page (`RecentPostRow`), so the two lists read alike.
 */
const props = defineProps<{ item: ResearchItem; busy: boolean }>()
const emit = defineEmits<{ decide: [what: PostDecision] }>()

/** A page that doesn't exist, or isn't public, can't go on the reading list. */
const unusable = computed(
  () => props.item.check === 'not-found' || props.item.check === 'not-public',
)
const name = computed(() => props.item.fetchedTitle || props.item.title || props.item.url)
const host = computed(() => {
  try {
    return new URL(props.item.url).host
  } catch {
    return props.item.url
  }
})
// Reconsidering undoes either decision, so the button says which.
const undoLabel = computed(() =>
  props.item.status === 'added' ? 'Take off the reading list' : 'Stop ignoring',
)
</script>

<template>
  <li class="flex gap-3 px-3 py-2">
    <!-- Decided: just the title, how it went, and a way back. -->
    <template v-if="item.status !== 'suggested'">
      <div class="flex min-w-0 flex-1 items-start gap-2">
        <span
          v-if="item.status === 'added'"
          class="font-bold text-ok"
          role="img"
          aria-label="In the reading list"
          >✓</span
        >
        <span v-else class="font-bold text-danger" role="img" aria-label="Ignored">✗</span>
        <span
          class="min-w-0 flex-1 break-words"
          :class="item.status === 'dismissed' ? 'text-ink-soft' : ''"
          >{{ name }}
          <span class="text-sm text-ink-soft">
            · {{ host }} · {{ item.status === 'added' ? 'in the reading list' : 'ignored' }}</span
          ></span
        >
      </div>
      <button
        v-tip="undoLabel"
        type="button"
        class="btn btn-sm btn-icon btn-ghost shrink-0"
        :disabled="busy"
        :aria-label="`${undoLabel}: ${name}`"
        @click="emit('decide', 'reconsider')"
      >
        <Icon name="undo" />
      </button>
    </template>
    <!-- Waiting for a decision: everything needed to make one. -->
    <template v-else>
      <div class="min-w-0 flex-1">
        <NewTabLink :href="item.url" class="break-words font-medium underline">{{
          name
        }}</NewTabLink>
        <p class="meta break-words">
          {{ host }}
          <template v-if="item.fetchedAuthors.length">
            · {{ item.fetchedAuthors.join(', ') }}</template
          >
        </p>
        <!-- The highlighter marks what the AI, not the writer or the page, said. -->
        <p class="text-sm">
          <span class="bg-mark">{{ item.why }}</span>
        </p>
        <p
          v-if="item.check === 'no-title'"
          class="mt-1 flex items-start gap-1 rounded-ctl bg-accent-wash p-2 text-sm"
        >
          <Icon name="alert" class="mt-0.5 shrink-0" />
          <span>
            We couldn’t confirm the title of this page. If you add it, it is listed as “{{
              item.title || item.url
            }}”.
          </span>
        </p>
        <p
          v-else-if="unusable"
          class="mt-1 flex items-start gap-1 rounded-ctl bg-danger-wash p-2 text-sm text-danger"
        >
          <Icon name="alert" class="mt-0.5 shrink-0" />
          <span>
            {{
              item.check === 'not-found'
                ? 'We couldn’t find a website at this address, so it can’t be added.'
                : 'This address isn’t a public website, so it can’t be added.'
            }}
          </span>
        </p>
      </div>
      <div class="flex shrink-0 items-start gap-2">
        <button
          v-tip="'Add to reading list'"
          type="button"
          class="btn btn-sm btn-icon btn-ghost"
          :disabled="unusable || busy"
          :aria-label="`Add to reading list: ${name}`"
          @click="emit('decide', 'add')"
        >
          <Icon name="check" />
        </button>
        <button
          v-tip="'Ignore'"
          type="button"
          class="btn btn-sm btn-icon btn-ghost"
          :disabled="busy"
          :aria-label="`Ignore: ${name}`"
          @click="emit('decide', 'ignore')"
        >
          <Icon name="close" />
        </button>
      </div>
    </template>
  </li>
</template>
