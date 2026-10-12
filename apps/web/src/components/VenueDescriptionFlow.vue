<script setup lang="ts">
import { PROFILE_DESCRIPTION_MAX, type Profile } from '@lfwa/core'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { api } from '../lib/api'
import { useSavedValue } from '../lib/forms'
import DescriptionOrigin from './DescriptionOrigin.vue'
import Markdown from './Markdown.vue'
import SaveStatus from './SaveStatus.vue'
import TextAreaField from './TextAreaField.vue'
import VenueSamplePicker from './VenueSamplePicker.vue'

/**
 * Describing a venue, in two optional steps: choose a few sample posts and have the AI draft a description from them,
 * or write it yourself; then read it, change it and use it. The AI only reflects what the posts show, nothing is
 * sent until its button is pressed, and an AI draft is not used by anything until the writer accepts it.
 */
const props = defineProps<{ profile: Profile }>()
const router = useRouter()
const queryClient = useQueryClient()
const refresh = () => queryClient.invalidateQueries({ queryKey: ['profiles'] })
const toProfile = () => router.push({ name: 'profile', params: { profileId: props.profile.id } })

const step = ref<'choose' | 'review'>(props.profile.description ? 'review' : 'choose')
const text = useSavedValue(() => props.profile.description ?? '', '')
const skipped = ref<{ url: string; message: string }[]>([])

const draft = useMutation({
  mutationFn: (urls: string[]) =>
    // A description that is there already is replaced only because the person chose to start again.
    api.draftVenueDescription(props.profile.id, { urls, replace: !!props.profile.description }),
  onSuccess: async (made) => {
    skipped.value = made.skipped
    text.value = made.profile.description ?? ''
    await refresh()
    step.value = 'review'
  },
})

const draftNotAccepted = computed(
  () =>
    props.profile.descriptionOrigin === 'inferred' &&
    !props.profile.descriptionConfirmed &&
    !!props.profile.description,
)
const unchanged = computed(() => text.value.trim() === (props.profile.description ?? ''))

const accept = useMutation({
  mutationFn: () =>
    // Accepting a draft as it stands needs no new words; anything else saves what is in the box.
    draftNotAccepted.value && unchanged.value
      ? api.confirmProfileDescription(props.profile.id)
      : api.setProfileDescription(props.profile.id, { description: text.value }),
  onSuccess: async () => {
    await refresh()
    await toProfile()
  },
})

function startAgain() {
  draft.reset()
  step.value = 'choose'
}
</script>

<template>
  <div>
    <section v-if="step === 'choose'" aria-labelledby="venue-choose-heading">
      <h2 id="venue-choose-heading" class="mb-2 font-display text-xl font-semibold">
        Draft it from a few posts
      </h2>
      <p class="mb-3 text-ink-soft">
        A few posts that show what the venue is like are enough. If it is new and has few posts, use
        posts from similar venues instead.
      </p>
      <p class="callout mb-4 text-sm">
        <strong>What is sent:</strong> when you press <em>Draft a description</em>, the text of the
        posts you chose goes to your own AI provider, using your own API key, to write a first
        draft. Nothing is sent before that. The draft only says what the posts show; you read it,
        change it and decide whether to use it, and nothing treats it as true until you do.
      </p>
      <VenueSamplePicker
        :profile-id="profile.id"
        :site-url="profile.siteUrl"
        use-label="Draft a description"
        busy-label="Drafting…"
        :busy="draft.isPending.value"
        @use="draft.mutate($event.map((s) => s.url))"
      />
      <SaveStatus :mutation="draft" saved="" class="mt-2" />

      <div class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
        <button type="button" class="btn btn-outline" @click="step = 'review'">
          {{ profile.description ? 'Back to the description' : 'Write it myself' }}
        </button>
        <RouterLink
          :to="{ name: 'profile', params: { profileId: profile.id } }"
          class="link text-sm"
        >
          Skip for now
        </RouterLink>
      </div>
    </section>

    <section v-else aria-labelledby="venue-review-heading">
      <h2 id="venue-review-heading" class="mb-2 font-display text-xl font-semibold">
        {{ draftNotAccepted ? 'Read it, change it, then use it' : 'The description' }}
      </h2>
      <DescriptionOrigin :profile="profile" class="mb-3" />
      <div v-if="skipped.length" role="status" class="callout mb-3 text-sm">
        <p>These posts could not be read, so the draft does not use them:</p>
        <ul class="mt-1 list-disc pl-5">
          <li v-for="s in skipped" :key="s.url" class="break-all">{{ s.url }}: {{ s.message }}</li>
        </ul>
      </div>
      <form @submit.prevent="accept.mutate()">
        <TextAreaField
          v-model="text"
          label="About this venue"
          :rows="10"
          :maxlength="PROFILE_DESCRIPTION_MAX"
          hint="What the venue is, who reads it and what kinds of writing go here. You can use Markdown."
        />
        <details v-if="text.trim()" class="panel mb-4">
          <summary class="cursor-pointer text-sm font-medium">Preview</summary>
          <Markdown :text="text" class="mt-2" />
        </details>
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="accept.isPending.value || !text.trim()"
          >
            {{
              accept.isPending.value
                ? 'Saving…'
                : draftNotAccepted
                  ? 'Use this description'
                  : 'Save description'
            }}
          </button>
          <button type="button" class="btn btn-outline" @click="startAgain">
            Draft from posts
            {{ profile.description ? '(replaces this)' : '' }}
          </button>
          <RouterLink
            :to="{ name: 'profile', params: { profileId: profile.id } }"
            class="link text-sm"
          >
            {{ draftNotAccepted ? 'Not now' : 'Cancel' }}
          </RouterLink>
        </div>
        <SaveStatus :mutation="accept" saved="" class="mt-2" />
        <p v-if="draftNotAccepted" class="mt-3 text-sm text-ink-soft">
          If you leave without using it, the draft is kept but the assistant will not see it.
        </p>
      </form>
    </section>
  </div>
</template>
