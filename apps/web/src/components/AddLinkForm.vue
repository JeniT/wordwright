<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { errorMessage } from '../lib/api'
import { readingRoute, useReadingActions, useReadingList } from '../lib/reading'
import Explain from './Explain.vue'
import TextField from './TextField.vue'

/**
 * The box that adds a web address to the reading list of an idea, or (no `ideaId`) of the publication. It sits above
 * the list, so it stays where it is as items pile up; what was just added is said under it, with a way to open it.
 */
const props = defineProps<{ publicationId: string; ideaId: string | null }>()
const emit = defineEmits<{ added: [] }>()
const owner = () => ({ publicationId: props.publicationId, ideaId: props.ideaId })
const { add, listOf } = useReadingActions(owner)
const list = useReadingList(owner)

const linkUrl = ref('')
const justAdded = ref<{ id: string; label: string } | null>(null)
// On failure what was typed stays in the field, with the reason shown under it.
function submit() {
  const before = new Set(list.links.value?.map((l) => l.id))
  justAdded.value = null
  add.mutate(linkUrl.value, {
    onSuccess: (saved) => {
      const item = listOf(saved).find((l) => !before.has(l.id))
      justAdded.value = item ? { id: item.id, label: item.title || item.url } : null
      linkUrl.value = ''
      emit('added')
    },
  })
}
</script>

<template>
  <form class="mb-6" @submit.prevent="submit">
    <TextField
      v-model="linkUrl"
      label="Web address"
      required
      autocomplete="off"
      autocapitalize="none"
      :spellcheck="false"
      :invalid="add.isError.value"
      :hint="
        add.isError.value
          ? errorMessage(add.error.value)
          : 'For example, https://example.org/article'
      "
      @update:model-value="add.isError.value && add.reset()"
    />
    <div class="flex flex-wrap items-center gap-2">
      <button type="submit" class="btn btn-outline" :disabled="add.isPending.value">
        {{ add.isPending.value ? 'Adding…' : 'Add item' }}
      </button>
      <Explain label="About adding an item">
        We look up its title for you. If we can’t find it, you can type it in afterwards.
      </Explain>
    </div>
    <p aria-live="polite" class="mt-2 text-sm">
      <template v-if="justAdded">
        Added “{{ justAdded.label }}”.
        <RouterLink :to="readingRoute(owner(), justAdded.id)" class="underline">
          Open it
        </RouterLink>
      </template>
    </p>
  </form>
</template>
