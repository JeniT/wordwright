<script setup lang="ts">
import { MAX_NOTE_TAGS } from '@wordwright/core'
import Icon from './Icon.vue'
import Explain from './Explain.vue'
import TagEntry from './TagEntry.vue'

/**
 * What goes in a list header when tagging the selected items together (notes, reading-list items): tags to add,
 * entered one at a time as on a single note (type, Enter, again), shown as chips that can be taken back out, and,
 * for each tag the selection already carries, a chip to press to take it off all of them. It only collects the
 * change (`add`, `remove`); the list sends it when the header's tick is pressed.
 */
defineProps<{
  /** What the list holds, singular ("note"). */
  noun: string
  /** How many are selected. */
  count: number
  /** The tags the selected ones carry, with how many of them carry each. */
  carried: readonly { tag: string; count: number }[]
  /** Every tag used anywhere in the list, to offer. */
  suggestions: readonly string[]
}>()
const add = defineModel<string[]>('add', { required: true })
const remove = defineModel<string[]>('remove', { required: true })

function addTag(tag: string) {
  if (!add.value.some((t) => t.toLowerCase() === tag.toLowerCase())) add.value = [...add.value, tag]
}
const isRemoving = (tag: string) => remove.value.includes(tag)
function toggleRemoving(tag: string) {
  remove.value = isRemoving(tag) ? remove.value.filter((t) => t !== tag) : [...remove.value, tag]
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <div class="flex flex-wrap items-center gap-1">
      <span class="text-sm font-medium">Add</span>
      <ul v-if="add.length" aria-label="Tags to add" class="flex flex-wrap gap-1">
        <li
          v-for="tag in add"
          :key="tag"
          class="inline-flex items-center rounded-ctl bg-line px-1.5 py-0.5 text-xs text-ink"
        >
          {{ tag }}
          <button
            type="button"
            class="ml-1 inline-flex rounded-ctl p-0.5 hover:bg-surface"
            :aria-label="`Don't add the tag ${tag}`"
            @click="add = add.filter((t) => t !== tag)"
          >
            <Icon name="close" :size="12" />
          </button>
        </li>
      </ul>
      <TagEntry label="Add a tag" :suggestions="suggestions" @add="addTag" />
    </div>
    <div
      v-if="carried.length"
      role="group"
      aria-label="Take a tag off all of them"
      class="flex flex-wrap items-center gap-1"
    >
      <span class="text-sm font-medium">Remove</span>
      <button
        v-for="item in carried"
        :key="item.tag"
        type="button"
        class="rounded-ctl border px-1.5 py-0.5 text-xs"
        :class="
          isRemoving(item.tag)
            ? 'border-danger bg-danger-wash text-danger line-through'
            : 'border-line-strong bg-surface text-ink'
        "
        :aria-pressed="isRemoving(item.tag)"
        :aria-label="`Remove “${item.tag}”`"
        :title="`On ${item.count} of the ${count} selected`"
        @click="toggleRemoving(item.tag)"
      >
        {{ item.tag }}
      </button>
    </div>
    <Explain label="About tagging several at once">
      Tags are added to what each {{ noun }} already has, up to {{ MAX_NOTE_TAGS }} each. Press a
      tag under Remove to take it off all of them.
    </Explain>
  </div>
</template>
