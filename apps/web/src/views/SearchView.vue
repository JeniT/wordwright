<script setup lang="ts">
import NextStep from '../components/NextStep.vue'
import ProfileGate from '../components/ProfileGate.vue'
import ProfileSources from '../components/ProfileSources.vue'
import RecentPosts from '../components/RecentPosts.vue'
import StepHeading from '../components/StepHeading.vue'

/**
 * Step 01 of a profile: look for things worth writing about. Recent posts from the feeds, which can be added to
 * the reading list, and the feeds themselves.
 */
defineProps<{ profileId: string }>()
</script>

<template>
  <ProfileGate v-slot="{ profile }" :profile-id="profileId">
    <StepHeading>Search</StepHeading>
    <p class="mb-8 text-ink-soft">
      Where ideas for {{ profile.name }} can come from. Choose the blogs, newsletters, news and
      journals you’d like to look through for things worth writing about, and add what looks good to
      the reading list.
    </p>
    <RecentPosts :profile-id="profileId" />
    <ProfileSources :profile-id="profileId" />
    <NextStep :to="{ name: 'read', params: { profileId } }" label="Next: 02 Read">
      Read what you’ve gathered on the reading list and take notes from it.
    </NextStep>
  </ProfileGate>
</template>
