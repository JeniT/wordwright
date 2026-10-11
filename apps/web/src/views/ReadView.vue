<script setup lang="ts">
import NextStep from '../components/NextStep.vue'
import ProfileGate from '../components/ProfileGate.vue'
import ReadingList from '../components/ReadingList.vue'
import StepHeading from '../components/StepHeading.vue'

/** Step 02 of a profile: the reading list, to read from and take notes while reading. */
defineProps<{ profileId: string }>()
</script>

<template>
  <ProfileGate :profile-id="profileId">
    <StepHeading>Read</StepHeading>
    <ReadingList :profile-id="profileId" :idea-id="null" />
    <NextStep :to="{ name: 'profile-notes', params: { profileId } }" label="Next: 03 Notes">
      Notes you take from your reading are kept together, ready to group into ideas.
    </NextStep>
  </ProfileGate>
</template>
