<script setup lang="ts">
import { computed, useId } from 'vue'
import Icon from './Icon.vue'

/**
 * Narrows a list to what carries every chosen tag. A select adds a tag; each chosen tag stays as a chip that takes it
 * away again, so a filtered list never looks like the whole list. Not shown at all until something has a tag.
 */
const props = defineProps<{ tags: readonly string[] }>()
const chosen = defineModel<string[]>({ default: () => [] })
const selectId = useId()

const isChosen = (tag: string) => chosen.value.some((c) => c.toLowerCase() === tag.toLowerCase())
const offered = computed(() => props.tags.filter((t) => !isChosen(t)))

function add(event: Event) {
  const select = event.target as HTMLSelectElement
  if (select.value) chosen.value = [...chosen.value, select.value]
  // Back to the prompt, so the next tag is one choice away.
  select.value = ''
}
const remove = (tag: string) => (chosen.value = chosen.value.filter((c) => c !== tag))
</script>

<template>
  <div v-if="tags.length || chosen.length" class="mb-3 flex flex-wrap items-center gap-2">
    <template v-if="offered.length">
      <label :for="selectId" class="sr-only">Filter by tag</label>
      <select :id="selectId" class="field !min-h-8 !w-auto !py-0.5 text-sm" @change="add">
        <option value="" selected>Choose a tag</option>
        <option v-for="tag in offered" :key="tag" :value="tag">{{ tag }}</option>
      </select>
    </template>
    <ul v-if="chosen.length" aria-label="Filtering by" class="flex flex-wrap gap-1">
      <li v-for="tag in chosen" :key="tag" class="chip chip-quiet">
        {{ tag }}
        <button
          type="button"
          class="ml-1 inline-flex rounded-ctl p-0.5 hover:bg-sunken"
          :aria-label="`Stop filtering by ${tag}`"
          @click="remove(tag)"
        >
          <Icon name="close" :size="12" />
        </button>
      </li>
    </ul>
  </div>
</template>
