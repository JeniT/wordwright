<script setup lang="ts">
import { PROFILE_DESCRIPTION_MAX, type Profile } from '@lfwa/core'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { api } from '../lib/api'
import { useSavedValue } from '../lib/forms'
import DescriptionGuidance from './DescriptionGuidance.vue'
import DescriptionOrigin from './DescriptionOrigin.vue'
import SaveStatus from './SaveStatus.vue'
import DescriptionEditor from './DescriptionEditor.vue'

/** Everyone who works in the profile can write this, so there is no owner-only branch. */
const props = defineProps<{ profile: Profile }>()
const queryClient = useQueryClient()

const text = useSavedValue(() => props.profile.description ?? '', '')
/** An AI draft nobody has accepted: saving it, even unchanged, is how it is accepted. */
const unaccepted = computed(
  () =>
    !!props.profile.description &&
    props.profile.descriptionOrigin === 'inferred' &&
    !props.profile.descriptionConfirmed,
)
const changed = computed(
  () => unaccepted.value || text.value.trim() !== (props.profile.description ?? ''),
)
const tooLong = computed(() => text.value.length > PROFILE_DESCRIPTION_MAX)

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
    <DescriptionOrigin :profile="profile" class="mb-3" />
    <DescriptionGuidance class="mb-4" />
    <form @submit.prevent="save.mutate()">
      <DescriptionEditor v-model="text" label="About this venue" />
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="save.isPending.value || !changed || tooLong"
        >
          {{
            save.isPending.value
              ? 'Saving…'
              : unaccepted
                ? 'Use this description'
                : 'Save description'
          }}
        </button>
        <SaveStatus :mutation="save" class="basis-full" />
      </div>
    </form>
  </section>
</template>
