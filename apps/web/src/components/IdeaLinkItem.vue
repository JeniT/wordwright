<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { nextTick, ref, useTemplateRef } from 'vue'
import type { IdeaLink } from '@lfwa/core'
import { api, errorMessage } from '../lib/api'
import TextField from './TextField.vue'

const props = defineProps<{ profileId: string; ideaId: string; link: IdeaLink }>()
const emit = defineEmits<{ remove: [] }>()
const queryClient = useQueryClient()

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

const save = useMutation({
  mutationFn: () =>
    api.updateIdeaLink(props.profileId, props.ideaId, props.link.id, {
      url: url.value,
      title: title.value,
    }),
  onSuccess: async (idea) => {
    queryClient.setQueryData(['idea', props.profileId, props.ideaId], idea)
    await queryClient.invalidateQueries({ queryKey: ['ideas'] })
    await stopEditing()
  },
})
</script>

<template>
  <li class="px-4 py-3">
    <form v-if="editing" ref="form" @submit.prevent="save.mutate()" @keydown.esc="stopEditing">
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
        <button
          type="submit"
          class="btn btn-neutral border-accent bg-accent text-white hover:bg-accent hover:opacity-90"
          :disabled="save.isPending.value"
        >
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

    <div v-else class="flex items-center justify-between gap-3">
      <a :href="link.url" target="_blank" rel="noopener noreferrer" class="min-w-0 underline">
        <span class="block truncate">{{ label() }}</span>
        <span v-if="link.title" class="block truncate text-sm text-stone-600">{{ link.url }}</span>
        <span class="sr-only">(opens in a new tab)</span>
      </a>
      <div class="flex shrink-0 gap-2">
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
    </div>
  </li>
</template>
