<script setup lang="ts">
import { ref } from 'vue'
import { errorMessage } from '../lib/api'
import { useReadingActions } from '../lib/reading'
import TextField from './TextField.vue'

/** The box that adds a web address to the reading list of an idea, or (no `ideaId`) of the publication. */
const props = defineProps<{ publicationId: string; ideaId: string | null }>()
const { add } = useReadingActions(() => ({
  publicationId: props.publicationId,
  ideaId: props.ideaId,
}))

const linkUrl = ref('')
// On failure what was typed stays in the field, with the reason shown under it.
function submit() {
  add.mutate(linkUrl.value, { onSuccess: () => (linkUrl.value = '') })
}
</script>

<template>
  <form @submit.prevent="submit">
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
          : 'For example, https://example.org/article. We look up its title for you.'
      "
      @update:model-value="add.isError.value && add.reset()"
    />
    <button type="submit" class="btn btn-outline" :disabled="add.isPending.value">
      {{ add.isPending.value ? 'Adding…' : 'Add link' }}
    </button>
  </form>
</template>
