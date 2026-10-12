<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { parseTags, tagsToText } from '../lib/note-tags'
import SwitchField from './SwitchField.vue'
import TextField from './TextField.vue'

/**
 * The panel under a list's toolbar for tagging the selected items together (notes, reading-list items): tags to add
 * to all of them, and a switch for each tag they already carry to take it off all of them. It only collects the
 * change; the list sends it. Opened and closed by the toolbar's Tag… button.
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

const text = ref('')
const removing = ref<string[]>([])
const headingId = useId()
const add = computed(() => parseTags(text.value))
const offered = computed(() =>
  props.suggestions.filter((t) => !add.value.some((a) => a.toLowerCase() === t.toLowerCase())),
)
const plural = computed(() => `${props.count} ${props.noun}${props.count === 1 ? '' : 's'}`)

function useSuggestion(tag: string) {
  text.value = tagsToText(parseTags(`${text.value}, ${tag}`))
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
      are added to what each already has.
    </p>
    <TextField
      v-model="text"
      label="Add tags"
      autocomplete="off"
      hint="Separate tags with commas, for example: intro, part 2."
    />
    <p v-if="offered.length" class="mb-4 -mt-2 text-xs text-ink-soft">
      Already used:
      <button
        v-for="tag in offered"
        :key="tag"
        type="button"
        class="mr-1 underline"
        :aria-label="`Add the tag ${tag}`"
        @click="useSuggestion(tag)"
      >
        {{ tag }}
      </button>
    </p>
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
