<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from 'vue'
import { RouterLink } from 'vue-router'
import type { IdeaLink, ReadingOrigin } from '@lfwa/core'
import { errorMessage } from '../lib/api'
import { readingRoute, useReadingActions } from '../lib/reading'
import TextField from './TextField.vue'

/** An item of an idea's reading list, or (no `ideaId`) of the profile's own. */
const props = defineProps<{ profileId: string; ideaId: string | null; link: IdeaLink }>()
const emit = defineEmits<{ remove: [] }>()
const owner = () => ({ profileId: props.profileId, ideaId: props.ideaId })
const { setRead, update: save } = useReadingActions(owner)

/** What the link is called: its title, or failing that the address itself. */
const label = () => props.link.title || props.link.url

const editing = ref(false)
const url = ref('')
const title = ref('')
const form = useTemplateRef<HTMLFormElement>('form')
const editButton = useTemplateRef<HTMLButtonElement>('editButton')

async function startEditing() {
  url.value = props.link.url
  title.value = props.link.title
  save.reset()
  editing.value = true
  await nextTick()
  form.value?.querySelector('input')?.focus()
}
async function stopEditing() {
  editing.value = false
  await nextTick()
  editButton.value?.focus()
}

/** Where an item came from, when it wasn't the writer. The AI's are marked with the highlighter; a feed's are not. */
const aiOrigin: Partial<Record<ReadingOrigin, string>> = {
  brainstorm: 'Suggested in brainstorming',
  research: 'Found by research',
  idea_generation: 'From idea generation',
}
const otherOrigin: Partial<Record<ReadingOrigin, string>> = { feed: 'From a feed' }

// Whether it has been read is the writer's say-so (they may have read it offline), so it is a plain checkbox.
const readBox = useTemplateRef<HTMLInputElement>('readBox')
function toggleRead(read: boolean) {
  setRead.mutate(
    { linkId: props.link.id, read },
    // The box has already flipped under the person's finger; put it back to what is saved.
    {
      onError: () => {
        if (readBox.value) readBox.value.checked = !!props.link.readAt
      },
    },
  )
}
function saveLink() {
  save.mutate(
    { linkId: props.link.id, url: url.value, title: title.value },
    { onSuccess: stopEditing },
  )
}
</script>

<template>
  <li class="px-4 py-3">
    <form v-if="editing" ref="form" @submit.prevent="saveLink" @keydown.esc="stopEditing">
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

    <div v-else class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div class="flex min-w-[14rem] flex-1 items-start gap-3">
        <label class="mt-0.5 flex shrink-0 items-center gap-1.5 text-sm">
          <input
            ref="readBox"
            type="checkbox"
            class="size-4 accent-accent"
            :checked="!!link.readAt"
            :disabled="setRead.isPending.value"
            :aria-label="`Read: ${label()}`"
            @change="toggleRead(($event.target as HTMLInputElement).checked)"
          />
          Read
        </label>
        <a
          :id="`reading-item-${link.id}`"
          :href="link.url"
          target="_blank"
          rel="noopener noreferrer"
          class="min-w-0 underline"
        >
          <span class="block truncate">{{ label() }}</span>
          <span v-if="link.title" class="block truncate text-sm text-ink-soft">{{ link.url }}</span>
          <span class="sr-only">(opens in a new tab)</span>
        </a>
      </div>
      <div class="flex shrink-0 gap-2">
        <RouterLink
          :to="readingRoute(owner(), link.id)"
          class="btn btn-neutral"
          :aria-describedby="`reading-item-${link.id}`"
        >
          Take notes
        </RouterLink>
        <button
          ref="editButton"
          type="button"
          class="btn btn-neutral"
          :aria-label="`Edit link to ${label()}`"
          @click="startEditing"
        >
          Edit
        </button>
        <button
          type="button"
          class="btn btn-neutral"
          :aria-label="`Remove link to ${label()}`"
          @click="emit('remove')"
        >
          Remove
        </button>
      </div>
      <p v-if="aiOrigin[link.origin]" class="w-full">
        <!-- The highlighter marks anything the AI, not the writer, put here. -->
        <span class="chip chip-ai">{{ aiOrigin[link.origin] }}</span>
      </p>
      <p v-else-if="otherOrigin[link.origin]" class="w-full">
        <span class="chip">{{ otherOrigin[link.origin] }}</span>
      </p>
      <p v-if="link.why" class="w-full text-sm text-ink-soft">
        <span class="font-medium">Why the AI suggested it (unchecked):</span> {{ link.why }}
      </p>
      <p v-if="setRead.isError.value" role="alert" class="w-full text-sm text-danger">
        Couldn't save that. Please try again.
      </p>
    </div>
  </li>
</template>
