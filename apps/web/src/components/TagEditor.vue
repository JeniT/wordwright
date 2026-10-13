<script setup lang="ts">
import { nextTick, ref, useTemplateRef, watch } from 'vue'
import { MAX_NOTE_TAGS } from '@lfwa/core'
import { errorMessage } from '../lib/api'
import Icon from './Icon.vue'
import TagEntry from './TagEntry.vue'

/**
 * The tags of one note or link, shown under it. A small label button opens a field: type a tag and press Enter, again
 * and again (each is saved at once, and the field stays), then press the tick when done. While the field is open each
 * tag has a small × to take it off. `save` stores the complete set of tags and rejects with what went wrong. Used on
 * quotations as well: tagging changes none of their words.
 */
const props = defineProps<{
  /** What these tags belong to, for the buttons' names ("Erosion loops."). */
  label: string
  tags: readonly string[]
  suggestions?: readonly string[]
  save: (tags: string[]) => Promise<unknown>
}>()

const open = ref(false)
const problem = ref('')
/** What is shown: the saved tags plus any change still being saved, so each Enter shows at once. */
const shown = ref<string[]>([...props.tags])
let inFlight = 0
watch(
  () => props.tags,
  (saved) => {
    if (!inFlight) shown.value = [...saved]
  },
)
let chain: Promise<unknown> = Promise.resolve()
function persist() {
  const next = [...shown.value]
  inFlight++
  chain = chain
    .then(() => props.save(next))
    .then(() => (problem.value = ''))
    .catch((err) => {
      problem.value = errorMessage(err)
      shown.value = [...props.tags]
    })
    .finally(() => {
      inFlight--
    })
}
function add(tag: string) {
  if (shown.value.some((t) => t.toLowerCase() === tag.toLowerCase())) return
  if (shown.value.length >= MAX_NOTE_TAGS) {
    problem.value = `Use ${MAX_NOTE_TAGS} tags or fewer. Take one off first.`
    return
  }
  problem.value = ''
  shown.value = [...shown.value, tag]
  persist()
}
function remove(tag: string) {
  shown.value = shown.value.filter((t) => t !== tag)
  persist()
}

const entry = useTemplateRef<InstanceType<typeof TagEntry>>('entry')
const opener = useTemplateRef<HTMLButtonElement>('opener')
async function show() {
  open.value = true
  await nextTick()
  entry.value?.focus()
}
async function hide() {
  open.value = false
  problem.value = ''
  await nextTick()
  opener.value?.focus()
}
</script>

<template>
  <div class="mt-1">
    <div class="flex flex-wrap items-center gap-1">
      <ul v-if="shown.length" aria-label="Tags" class="flex flex-wrap gap-1">
        <li
          v-for="tag in shown"
          :key="tag"
          class="inline-flex items-center rounded-ctl bg-line px-1.5 py-0.5 text-xs text-ink"
        >
          {{ tag }}
          <button
            v-if="open"
            type="button"
            class="ml-1 inline-flex rounded-ctl p-0.5 hover:bg-sunken"
            :aria-label="`Remove the tag ${tag} from ${label}`"
            @click="remove(tag)"
          >
            <Icon name="close" :size="12" />
          </button>
        </li>
      </ul>
      <button
        v-if="!open"
        ref="opener"
        type="button"
        class="btn btn-sm btn-icon btn-quiet !min-h-7 !w-7"
        :title="`Add tags to ${label}`"
        :aria-label="`Add tags to ${label}`"
        aria-expanded="false"
        @click="show"
      >
        <Icon name="label" :size="14" />
      </button>
      <template v-else>
        <TagEntry
          ref="entry"
          :label="`Add a tag to ${label}`"
          :suggestions="suggestions"
          @add="add"
          @escape="hide"
        />
        <button
          type="button"
          class="btn btn-sm btn-icon btn-quiet !min-h-7 !w-7"
          :title="`Done tagging ${label}`"
          :aria-label="`Done tagging ${label}`"
          aria-expanded="true"
          @click="hide"
        >
          <Icon name="check" :size="14" />
        </button>
      </template>
    </div>
    <p v-if="problem" role="alert" class="mt-1 text-xs text-danger">{{ problem }}</p>
  </div>
</template>
