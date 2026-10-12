<script setup lang="ts">
import { PROFILE_DESCRIPTION_MAX, type Profile } from '@lfwa/core'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { api } from '../lib/api'
import { useSavedValue } from '../lib/forms'
import Markdown from './Markdown.vue'
import SaveStatus from './SaveStatus.vue'
import TextAreaField from './TextAreaField.vue'

/** Everyone who works in the profile can write this, so there is no owner-only branch. */
const props = defineProps<{ profile: Profile }>()
const queryClient = useQueryClient()

const text = useSavedValue(() => props.profile.description ?? '', '')
const changed = computed(() => text.value.trim() !== (props.profile.description ?? ''))

const save = useMutation({
  mutationFn: () => api.setProfileDescription(props.profile.id, { description: text.value }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profiles'] }),
})
</script>

<template>
  <section aria-labelledby="description-heading">
    <h2 id="description-heading" class="mb-3 font-display text-xl font-semibold">Description</h2>
    <p class="mb-3 text-sm text-ink-soft">
      What this venue is, who reads it, and what kinds of writing go here. It can be as short as
      “Personal weeknotes, mostly for me”. Everyone who shares this profile can change it, and it's
      the first thing people see on the profile page.
    </p>
    <form @submit.prevent="save.mutate()">
      <TextAreaField
        v-model="text"
        label="About this venue"
        :rows="8"
        :maxlength="PROFILE_DESCRIPTION_MAX"
        hint="You can use Markdown: *emphasis*, lists, and [links](https://example.com)."
      />
      <details v-if="text.trim()" class="panel mb-4">
        <summary class="cursor-pointer text-sm font-medium">Preview</summary>
        <Markdown :text="text" class="mt-2" />
      </details>
      <div class="flex flex-wrap items-center gap-3">
        <button type="submit" class="btn btn-primary" :disabled="save.isPending.value || !changed">
          {{ save.isPending.value ? 'Saving…' : 'Save description' }}
        </button>
        <SaveStatus :mutation="save" class="basis-full" />
      </div>
    </form>
  </section>
</template>
