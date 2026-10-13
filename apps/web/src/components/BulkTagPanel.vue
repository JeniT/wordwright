<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { MAX_NOTE_TAGS } from '@lfwa/core'
import Icon from './Icon.vue'
import SwitchField from './SwitchField.vue'
import TagEntry from './TagEntry.vue'

/**
 * The panel under a list's toolbar for tagging the selected items together (notes, reading-list items): tags to add
 * to all of them, entered one at a time as on a single note (type, Enter, again), and a switch for each tag they
 * already carry to take it off all of them. It only collects the change; the list sends it. Opened and closed by the
 * toolbar's Tag… button.
 */
const props = defineProps<{
  /** What the list holds, singular ("note"), to name the button and say how many are chosen. */
  noun: string
  /** How many are selected. */
  count: number
  /** The tags the selected ones carry, with how many of them carry each. */
  carried: readonly { tag: string; count: number }[]
  /** Every tag used anywhere in the list, to offer. */
  suggestions: readonly string[]
  pending: boolean
  /** What went wrong the last time, if anything. */
  error?: string
}>()
const emit = defineEmits<{ apply: [change: { add: string[]; remove: string[] }]; cancel: [] }>()

const add = ref<string[]>([])
const removing = ref<string[]>([])
const headingId = useId()
const plural = computed(() => `${props.count} ${props.noun}${props.count === 1 ? '' : 's'}`)

function addTag(tag: string) {
  if (!add.value.some((t) => t.toLowerCase() === tag.toLowerCase())) add.value = [...add.value, tag]
}
const isRemoving = (tag: string) => removing.value.includes(tag)
function setRemoving(tag: string, on: boolean) {
  removing.value = on ? [...removing.value, tag] : removing.value.filter((t) => t !== tag)
}
const canApply = computed(
  () => props.count > 0 && !props.pending && add.value.length + removing.value.length > 0,
)
</script>

<template>
  <form
    class="border-b border-line bg-sunken p-3"
    :aria-labelledby="headingId"
    @submit.prevent="emit('apply', { add, remove: removing })"
  >
    <p :id="headingId" class="mb-2 text-sm text-ink-soft">
      Tag the {{ count }} {{ noun }}{{ count === 1 ? '' : 's' }} you have selected together. Tags
      are added to what each already has (up to {{ MAX_NOTE_TAGS }} each).
    </p>
    <div class="mb-3 flex flex-wrap items-center gap-1">
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
    <fieldset v-if="carried.length" class="mb-3">
      <legend class="mb-1 text-sm font-medium">Take a tag off all of them</legend>
      <div v-for="item in carried" :key="item.tag" class="mb-1">
        <SwitchField
          :model-value="isRemoving(item.tag)"
          :label="`Remove “${item.tag}”`"
          @update:model-value="setRemoving(item.tag, $event)"
        />
        <p class="meta">On {{ item.count }} of the {{ count }} selected.</p>
      </div>
    </fieldset>
    <div class="flex flex-wrap items-center gap-2">
      <button type="submit" class="btn btn-sm btn-primary" :disabled="!canApply">
        {{ pending ? 'Tagging…' : `Tag ${plural}` }}
      </button>
      <button type="button" class="btn btn-sm btn-neutral" @click="emit('cancel')">Cancel</button>
    </div>
    <p v-if="error" role="alert" class="mt-2 text-sm text-danger">{{ error }}</p>
  </form>
</template>
