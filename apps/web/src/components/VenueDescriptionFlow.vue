<script setup lang="ts">
import { PROFILE_DESCRIPTION_MAX, type Profile } from '@lfwa/core'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { api } from '../lib/api'
import { useSavedValue } from '../lib/forms'
import DescriptionOrigin from './DescriptionOrigin.vue'
import SaveStatus from './SaveStatus.vue'
import DescriptionEditor from './DescriptionEditor.vue'
import VenueSamplePicker from './VenueSamplePicker.vue'

/**
 * Describing a venue: a box to write the description in, and, under it, an optional section that chooses a few
 * sample posts and has the AI draft one from them. The AI only reflects what the posts show, nothing is sent until
 * its button is pressed, and a draft fills the box, marked as the AI's and used by nothing until the writer accepts it.
 */
const props = defineProps<{ profile: Profile }>()
const router = useRouter()
const queryClient = useQueryClient()
const refresh = () => queryClient.invalidateQueries({ queryKey: ['profiles'] })
const toProfile = () => router.push({ name: 'profile', params: { profileId: props.profile.id } })

const text = useSavedValue(() => props.profile.description ?? '', '')
const skipped = ref<{ url: string; message: string }[]>([])
const root = useTemplateRef<HTMLElement>('root')

/** Closed until asked for (writing it yourself is the main way, drafting is a help), and closed again by a draft. */
const drafting = useTemplateRef<HTMLDetailsElement>('drafting')

const unaccepted = computed(
  () =>
    props.profile.descriptionOrigin === 'inferred' &&
    !props.profile.descriptionConfirmed &&
    !!props.profile.description,
)
const unchanged = computed(() => text.value.trim() === (props.profile.description ?? ''))
/** A draft takes the box's place, so say so when there is something in it, saved or not. */
const tooLong = computed(() => text.value.length > PROFILE_DESCRIPTION_MAX)
const replaces = computed(() => !!text.value.trim() || !!props.profile.description)

const draft = useMutation({
  mutationFn: (urls: string[]) =>
    // A description that is there already is replaced only because the person pressed Draft.
    api.draftVenueDescription(props.profile.id, { urls, replace: !!props.profile.description }),
  onSuccess: async (made) => {
    skipped.value = made.skipped
    text.value = made.profile.description ?? ''
    await refresh()
    if (drafting.value) drafting.value.open = false
    // The draft is what to read next: take the person to it.
    await nextTick()
    root.value?.querySelector<HTMLElement>('[role=textbox], textarea')?.focus()
  },
})

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
  <div ref="root">
    <section aria-labelledby="venue-description-heading">
      <h2 id="venue-description-heading" class="mb-2 font-display text-xl font-semibold">
        {{ unaccepted ? 'Read it, change it, then use it' : 'The description' }}
      </h2>
      <DescriptionOrigin :profile="profile" class="mb-3" />
      <p v-if="draft.isSuccess.value" role="status" class="callout mb-3 text-sm">
        The draft is in the box below. Read it, change anything that is wrong, then use it.
      </p>
      <div v-if="skipped.length" role="status" class="callout mb-3 text-sm">
        <p>These posts could not be read, so the draft does not use them:</p>
        <ul class="mt-1 list-disc pl-5">
          <li v-for="s in skipped" :key="s.url" class="break-all">{{ s.url }}: {{ s.message }}</li>
        </ul>
      </div>
      <form @submit.prevent="accept.mutate()">
        <DescriptionEditor
          v-model="text"
          label="About this venue"
          hint="What the venue is, who reads it and what kinds of writing go here."
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

    <details ref="drafting" class="panel mt-8 p-4">
      <summary class="cursor-pointer font-display text-lg font-semibold">
        Draft from a few posts
      </summary>
      <div class="mt-3">
        <p class="mb-3 text-ink-soft">
          A few posts that show what the venue is like are enough. If it is new and has few posts,
          use posts from similar venues instead.
        </p>
        <p class="callout mb-4 text-sm">
          <strong>What is sent:</strong> when you press <em>Draft a description</em>, the text of
          the posts you chose goes to your own AI provider, using your own API key, to write a first
          draft. Nothing is sent before that. The draft only says what the posts show; you read it,
          change it and decide whether to use it, and nothing treats it as true until you do.
        </p>
        <p v-if="replaces" class="callout mb-4 text-sm">A draft replaces what is in the box now.</p>
        <VenueSamplePicker
          :profile-id="profile.id"
          :site-url="profile.siteUrl"
          use-label="Draft a description"
          busy-label="Drafting…"
          :busy="draft.isPending.value"
          @use="draft.mutate($event.map((s) => s.url))"
        />
        <SaveStatus :mutation="draft" saved="" class="mt-2" />
      </div>
    </details>
  </div>
</template>
