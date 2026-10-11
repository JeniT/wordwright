<script setup lang="ts">
import { RouterLink } from 'vue-router'
import IdeaNotes from '../components/IdeaNotes.vue'
import NextStep from '../components/NextStep.vue'
import ProfileGate from '../components/ProfileGate.vue'
import StepHeading from '../components/StepHeading.vue'
import { useReadingList } from '../lib/reading'

/** Step 02 of a profile: its own notes, made while reading or jotted down, before they belong to an idea. */
const props = defineProps<{ profileId: string }>()

// Each note says which item of the reading list it was taken from.
const reading = useReadingList(() => ({ profileId: props.profileId, ideaId: null }))
</script>

<template>
  <ProfileGate :profile-id="profileId">
    <StepHeading>Notes</StepHeading>
    <IdeaNotes
      :profile-id="profileId"
      :idea-id="null"
      :reading-list="reading.links.value ?? []"
      quiet-heading
    />
    <p class="text-sm text-ink-soft">
      Take notes from something you are reading on the
      <RouterLink :to="{ name: 'read', params: { profileId } }" class="link">
        profile’s reading list</RouterLink
      >.
    </p>
    <NextStep :to="{ name: 'profile-ideas', params: { profileId } }" label="Next: 04 Ideas">
      When a group of notes feels like something you’d write about, start an idea.
    </NextStep>
  </ProfileGate>
</template>
