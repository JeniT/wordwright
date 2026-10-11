<script setup lang="ts">
import NextStep from '../components/NextStep.vue'
import ProfileGate from '../components/ProfileGate.vue'
import ProfileSources from '../components/ProfileSources.vue'
import ReadingList from '../components/ReadingList.vue'
import RecentPosts from '../components/RecentPosts.vue'
import StepHeading from '../components/StepHeading.vue'

/**
 * Step 01 of a profile: where ideas can come from. Recent posts from the feeds, the reading list they are added
 * to (and read from, taking notes), and the feeds themselves.
 */
defineProps<{ profileId: string }>()
</script>

<template>
  <ProfileGate v-slot="{ profile }" :profile-id="profileId">
    <StepHeading>Inspiration</StepHeading>
    <p class="mb-8 text-ink-soft">
      Where ideas for {{ profile.name }} can come from. Choose the blogs, newsletters, news and
      journals you’d like to look through for things worth writing about, add what looks good to the
      reading list, then read it and take notes.
    </p>
    <RecentPosts :profile-id="profileId" />
    <div id="reading-list">
      <ReadingList :profile-id="profileId" :idea-id="null" />
    </div>
    <ProfileSources :profile-id="profileId" />
    <NextStep :to="{ name: 'profile-notes', params: { profileId } }" label="Next: 02 Notes">
      Notes you take from your reading are kept together, ready to group into ideas.
    </NextStep>
  </ProfileGate>
</template>
