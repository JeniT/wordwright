<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import Icon from './Icon.vue'

/**
 * Narrows a list to what carries every chosen tag. A text box with a tag icon suggests the tags on the list that are
 * not chosen yet as you type; Return (or Tab, when it can tell which) adds one and leaves the focus in the box for the
 * next. Each chosen tag stays as a
 * chip that takes it away again, so a filtered list never looks like the whole list. Not shown at all until something
 * has a tag.
 */
const props = defineProps<{ tags: readonly string[] }>()
const chosen = defineModel<string[]>({ default: () => [] })
const inputId = useId()
const listId = useId()
const messageId = useId()

const text = ref('')
const open = ref(false)
const active = ref(-1)
const message = ref('')

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const isChosen = (tag: string) => chosen.value.some((c) => same(c, tag))
const offered = computed(() => props.tags.filter((t) => !isChosen(t)))
const suggestions = computed(() => {
  const typed = text.value.trim().toLowerCase()
  return offered.value.filter((t) => t.toLowerCase().includes(typed))
})
const showList = computed(() => open.value && suggestions.value.length > 0)
const optionId = (i: number) => `${listId}-${i}`

function change() {
  message.value = ''
  open.value = true
  active.value = -1
}

function add(tag: string) {
  chosen.value = [...chosen.value, tag]
  text.value = ''
  message.value = ''
  active.value = -1
  // The list is for choosing the next tag: closed until they ask again, with focus still in the box.
  open.value = false
}

function enter() {
  const typed = text.value.trim()
  const picked = suggestions.value[active.value]
  if (picked) return add(picked)
  if (!typed) return
  // A tag typed in full wins over an earlier one that merely starts with it; otherwise the first match.
  const match = offered.value.find((t) => same(t, typed)) ?? suggestions.value[0]
  if (match) return add(match)
  message.value = isChosen(typed)
    ? `Already filtering by “${typed}”.`
    : `No notes or links are tagged “${typed}”. Pick one from the list.`
}

/**
 * Tab completes like a shell: a highlighted or only suggestion is chosen, and several that share more than has been
 * typed fill in the shared part. Anything else lets Tab move on, so the box never traps the keyboard, and a bare
 * focus (nothing typed, nothing arrowed to) never changes the filter.
 */
function tab(event: KeyboardEvent) {
  const typed = text.value.trim()
  if (!showList.value || (!typed && active.value < 0)) return
  const picked =
    suggestions.value[active.value] ??
    (suggestions.value.length === 1 ? suggestions.value[0] : undefined)
  if (picked) {
    event.preventDefault()
    return add(picked)
  }
  const shared = commonPrefix(suggestions.value)
  const starts = suggestions.value.every((t) => t.toLowerCase().startsWith(typed.toLowerCase()))
  if (!starts || shared.length <= typed.length) return
  event.preventDefault()
  text.value = shared
}

function commonPrefix(tags: readonly string[]) {
  let prefix = tags[0] ?? ''
  for (const tag of tags) {
    let n = 0
    while (
      n < prefix.length &&
      n < tag.length &&
      prefix.charAt(n).toLowerCase() === tag.charAt(n).toLowerCase()
    )
      n++
    prefix = prefix.slice(0, n)
  }
  return prefix
}

function move(step: 1 | -1) {
  open.value = true
  const n = suggestions.value.length
  if (!n) return
  active.value = (active.value + step + n) % n
}

function escape(event: KeyboardEvent) {
  if (!showList.value) return
  // Only the list closes, not a drawer or dialog the filter sits in.
  event.stopPropagation()
  open.value = false
  active.value = -1
}

const remove = (tag: string) => (chosen.value = chosen.value.filter((c) => !same(c, tag)))
</script>

<template>
  <div v-if="tags.length || chosen.length" class="mb-3 flex flex-wrap items-center gap-2">
    <div v-if="offered.length" class="relative">
      <label :for="inputId" class="sr-only">Filter by tag</label>
      <span class="pointer-events-none absolute inset-y-0 left-2 flex items-center text-ink-soft">
        <Icon name="label" :size="16" />
      </span>
      <input
        :id="inputId"
        v-model="text"
        type="text"
        role="combobox"
        autocomplete="off"
        placeholder="Filter by tag"
        class="field field-compact !w-48 !pl-8"
        aria-autocomplete="list"
        :aria-expanded="showList"
        :aria-controls="listId"
        :aria-activedescendant="showList && active >= 0 ? optionId(active) : undefined"
        :aria-describedby="message ? messageId : undefined"
        :aria-invalid="message ? true : undefined"
        @input="change"
        @focus="open = true"
        @blur="open = false"
        @keydown.enter.prevent="enter"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.tab="tab"
        @keydown.esc="escape"
      />
      <ul
        v-show="showList"
        :id="listId"
        role="listbox"
        aria-label="Tags"
        class="panel absolute left-0 top-full z-20 mt-1 max-h-60 w-full min-w-48 overflow-auto p-1"
      >
        <li
          v-for="(tag, i) in suggestions"
          :id="optionId(i)"
          :key="tag"
          role="option"
          :aria-selected="i === active"
          class="cursor-pointer rounded-ctl px-2 py-1 text-sm"
          :class="i === active ? 'bg-accent-wash' : 'hover:bg-sunken'"
          @mousedown.prevent="add(tag)"
        >
          {{ tag }}
        </li>
      </ul>
    </div>
    <p
      v-if="message"
      :id="messageId"
      role="alert"
      class="flex items-center gap-1 text-sm text-danger"
    >
      <Icon name="alert" :size="14" />
      {{ message }}
    </p>
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
