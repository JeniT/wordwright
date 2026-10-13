<script setup lang="ts">
import { PROFILE_DESCRIPTION_MAX, type Profile } from '@lfwa/core'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { api } from '../lib/api'
import { useSavedValue } from '../lib/forms'
import DescriptionGuidance from './DescriptionGuidance.vue'
import DescriptionOrigin from './DescriptionOrigin.vue'
import SaveStatus from './SaveStatus.vue'
import DescriptionEditor from './DescriptionEditor.vue'

/**
 * Describing a venue: guidance on what a description needs, and a box to write it in. The writer's own words are the
 * only source of a description. One an AI drafted before drafting was removed (#150) is still shown, marked as the
 * AI's, and used by nothing until the writer accepts it.
 */
const props = defineProps<{ profile: Profile }>()
const router = useRouter()
const queryClient = useQueryClient()
const refresh = () => queryClient.invalidateQueries({ queryKey: ['profiles'] })
const toProfile = () => router.push({ name: 'profile', params: { profileId: props.profile.id } })

const text = useSavedValue(() => props.profile.description ?? '', '')

const unaccepted = computed(
  () =>
    props.profile.descriptionOrigin === 'inferred' &&
    !props.profile.descriptionConfirmed &&
    !!props.profile.description,
)
const unchanged = computed(() => text.value.trim() === (props.profile.description ?? ''))
const tooLong = computed(() => text.value.length > PROFILE_DESCRIPTION_MAX)

const accept = useMutation({
  mutationFn: () =>
    // Accepting a draft as it stands needs no new words; anything else saves what is in the box.
    unaccepted.value && unchanged.value
      ? api.confirmProfileDescription(props.profile.id)
      : api.setProfileDescription(props.profile.id, { description: text.value }),
  onSuccess: async () => {
    await refresh()
    await toProfile()
  },
})
</script>

<template>
  <div>
    <section aria-labelledby="venue-description-heading">
      <h2 id="venue-description-heading" class="mb-2 font-display text-xl font-semibold">
        {{ unaccepted ? 'Read it, change it, then use it' : 'The description' }}
      </h2>
      <DescriptionOrigin :profile="profile" class="mb-3" />
      <DescriptionGuidance class="mb-4" open />
      <form @submit.prevent="accept.mutate()">
        <DescriptionEditor
          v-model="text"
          label="About this venue"
          hint="What the venue is, who reads it and what kinds of writing go here. The notes above say more."
        />
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="accept.isPending.value || !text.trim() || tooLong"
          >
            {{
              accept.isPending.value
                ? 'Saving…'
                : unaccepted
                  ? 'Use this description'
                  : 'Save description'
            }}
          </button>
          <RouterLink
            :to="{ name: 'profile', params: { profileId: profile.id } }"
            class="link text-sm"
          >
            {{ unaccepted ? 'Not now' : profile.description ? 'Cancel' : 'Skip for now' }}
          </RouterLink>
        </div>
        <SaveStatus :mutation="accept" saved="" class="mt-2" />
        <p v-if="unaccepted" class="mt-3 text-sm text-ink-soft">
          If you leave without using it, the draft is kept but the assistant will not see it.
        </p>
      </form>
    </section>
  </div>
</template>
