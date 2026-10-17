<script setup lang="ts">
import NewTabLink from './NewTabLink.vue'
import { computed, ref, useTemplateRef } from 'vue'
import { RouterLink } from 'vue-router'
import { PUBLICATION_READING_DAYS, type IdeaLink, type ReadingOrigin } from '@wordwright/core'
import { errorMessage } from '../lib/api'
import { readingRoute, useReadingActions } from '../lib/reading'
import HoldButton from './HoldButton.vue'
import Icon from './Icon.vue'
import TagEditor from './TagEditor.vue'
import SwitchField from './SwitchField.vue'
import TextField from './TextField.vue'
import { useInlineEdit } from '../lib/inline-edit'
import { vTip } from '../lib/tip'

/** An item of an idea's reading list, or (no `ideaId`) of the publication's own. */
const props = defineProps<{
  publicationId: string
  ideaId: string | null
  link: IdeaLink
  /** Chosen for a bulk action in the list's toolbar. */
  selected?: boolean
  /** Tags used elsewhere on the list, offered when editing. */
  knownTags?: readonly string[]
}>()
const emit = defineEmits<{ remove: []; select: [on: boolean] }>()
const owner = () => ({ publicationId: props.publicationId, ideaId: props.ideaId })
const { setRead, setKept, setTags, update: save } = useReadingActions(owner)
const saveTags = (tags: string[]) => setTags.mutateAsync({ linkId: props.link.id, tags })

/** What the link is called: its title, or failing that the address itself. */
const label = () => props.link.title || props.link.url

const url = ref('')
const title = ref('')
const form = useTemplateRef<HTMLFormElement>('form')
const editButton = useTemplateRef<HTMLButtonElement>('editButton')
const {
  editing: editingKey,
  start,
  stop: stopEditing,
} = useInlineEdit<'link'>({
  field: () => form.value?.querySelector('input'),
  trigger: () => editButton.value,
})
const editing = computed(() => editingKey.value !== null)

function startEditing() {
  url.value = props.link.url
  title.value = props.link.title
  save.reset()
  return start('link')
}

/** Where an item came from, when it wasn't the writer. The AI's are marked with the highlighter; a feed's are not. */
const aiOrigin: Partial<Record<ReadingOrigin, string>> = {
  brainstorm: 'Suggested in brainstorming',
  research: 'Found by research',
  idea_generation: 'From idea generation',
}
const otherOrigin: Partial<Record<ReadingOrigin, string>> = { feed: 'From a feed' }

// Whether it has been read is the writer's say-so (they may have read it offline). A switch flips at once; if
// saving fails it goes back to what is saved.
const readSwitch = useTemplateRef<InstanceType<typeof SwitchField>>('readSwitch')
function toggleRead(read: boolean) {
  setRead.mutate({ linkId: props.link.id, read }, { onError: () => readSwitch.value?.revert() })
}
const keepSwitch = useTemplateRef<InstanceType<typeof SwitchField>>('keepSwitch')
function toggleKept(kept: boolean) {
  setKept.mutate({ linkId: props.link.id, kept }, { onError: () => keepSwitch.value?.revert() })
}

/** The address without the clutter: the link above it is the one thing to press. */
const host = () => {
  try {
    return new URL(props.link.url).hostname.replace(/^www\./, '')
  } catch {
    return props.link.url
  }
}
/** When an unkept item will drop off the publication's list: a month after it was added. */
const dropsOn = () => {
  if (!props.link.addedAt) return null
  const day = new Date(Date.parse(props.link.addedAt) + PUBLICATION_READING_DAYS * 86_400_000)
  return day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
/** What removing does to the writer's way back, said where they press and hold. */
const removeHint = () =>
  props.link.origin === 'feed'
    ? 'Press and hold, or tap twice, to remove. It stays in the feed it came from.'
    : props.link.origin === 'entered'
      ? 'Press and hold, or tap twice, to remove. Nothing else keeps a copy of it.'
      : 'Press and hold, or tap twice, to remove. You can find it again where it came from.'
function saveLink() {
  save.mutate(
    { linkId: props.link.id, url: url.value, title: title.value },
    { onSuccess: stopEditing },
  )
}
</script>

<template>
  <li>
    <form
      v-if="editing"
      ref="form"
      class="px-4 py-3"
      @submit.prevent="saveLink"
      @keydown.esc="stopEditing"
    >
      <TextField
        v-model="url"
        label="Web address of this link"
        required
        autocomplete="off"
        autocapitalize="none"
        :spellcheck="false"
        :invalid="save.isError.value"
        :hint="save.isError.value ? errorMessage(save.error.value) : undefined"
        @update:model-value="save.isError.value && save.reset()"
      />
      <TextField
        v-model="title"
        label="Title of this link (optional)"
        autocomplete="off"
        :maxlength="200"
        hint="Leave this blank to look the title up again."
      />
      <div class="flex gap-2">
        <button type="submit" class="btn btn-primary" :disabled="save.isPending.value">
          {{ save.isPending.value ? 'Saving…' : 'Save link' }}
        </button>
        <button
          type="button"
          class="btn btn-neutral"
          :disabled="save.isPending.value"
          @click="stopEditing"
        >
          Cancel
        </button>
      </div>
    </form>

    <div v-else class="flex items-stretch">
      <div class="list-rail">
        <input
          type="checkbox"
          :checked="selected"
          :aria-label="`Select ${label()}`"
          @change="emit('select', ($event.target as HTMLInputElement).checked)"
        />
      </div>
      <div class="min-w-0 flex-1 px-4 py-3">
        <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div class="min-w-[14rem] flex-1">
            <NewTabLink
              :id="`reading-item-${link.id}`"
              :href="link.url"
              class="line-clamp-2 break-words underline"
              >{{ label() }}</NewTabLink
            >
            <p class="meta mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span v-if="link.title" class="truncate">{{ host() }}</span>
              <!-- The highlighter marks anything the AI, not the writer, put here. -->
              <span v-if="aiOrigin[link.origin]" class="chip chip-ai">{{
                aiOrigin[link.origin]
              }}</span>
              <span v-else-if="otherOrigin[link.origin]" class="chip chip-quiet">{{
                otherOrigin[link.origin]
              }}</span>
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <RouterLink
              :to="readingRoute(owner(), link.id)"
              class="btn btn-sm btn-neutral"
              :aria-describedby="`reading-item-${link.id}`"
            >
              Take notes
            </RouterLink>
            <button
              ref="editButton"
              v-tip="'Edit'"
              type="button"
              class="btn btn-sm btn-icon btn-ghost"
              :aria-label="`Edit link to ${label()}`"
              @click="startEditing"
            >
              <Icon name="edit" />
            </button>
            <HoldButton
              :tip="removeHint()"
              verb="Remove"
              class="btn btn-sm btn-icon btn-ghost btn-ghost-danger"
              :aria-label="`Remove link to ${label()}`"
              @confirm="emit('remove')"
            >
              <Icon name="remove" />
            </HoldButton>
          </div>
        </div>
        <TagEditor :label="label()" :tags="link.tags" :suggestions="knownTags" :save="saveTags" />
        <p v-if="link.why" class="mt-2 text-sm text-ink-soft">
          <span class="font-medium">Why the AI suggested it (unchecked):</span> {{ link.why }}
        </p>
        <div class="mt-1 flex flex-wrap items-center gap-x-6">
          <SwitchField
            ref="readSwitch"
            :model-value="!!link.readAt"
            label="Read"
            :name="`Read: ${label()}`"
            :disabled="setRead.isPending.value"
            @update:model-value="toggleRead"
          />
          <!-- Only the publication's own list drops items after a month; this one is to stay. -->
          <SwitchField
            v-if="!ideaId"
            ref="keepSwitch"
            :model-value="!!link.kept"
            label="Keep"
            :name="`Keep: ${label()}`"
            :disabled="setKept.isPending.value"
            @update:model-value="toggleKept"
          />
          <p v-if="!ideaId && !link.kept && dropsOn()" class="meta">
            Removed from this list on {{ dropsOn() }} unless kept
          </p>
        </div>
        <p
          v-if="setRead.isError.value || setKept.isError.value"
          role="alert"
          class="mt-1 text-sm text-danger"
        >
          Couldn't save that. Please try again.
        </p>
      </div>
    </div>
  </li>
</template>
