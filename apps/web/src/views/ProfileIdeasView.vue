<script setup lang="ts">
import { RouterLink } from 'vue-router'
import ProfileGate from '../components/ProfileGate.vue'
import StepHeading from '../components/StepHeading.vue'
import { useIdeas } from '../lib/queries'

/** Step 03 of a profile: choose which idea to work on next. */
const props = defineProps<{ profileId: string }>()
const ideas = useIdeas(() => props.profileId)
</script>

<template>
  <ProfileGate :profile-id="profileId">
    <StepHeading>Ideas</StepHeading>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <p class="max-w-prose text-ink-soft">Choose what to work on next.</p>
      <RouterLink :to="{ name: 'new-idea', params: { profileId } }" class="btn btn-primary">
        New idea
      </RouterLink>
    </div>
    <p v-if="ideas.isPending.value">Loading…</p>
    <p v-else-if="ideas.isError.value" role="alert" class="text-danger">
      Couldn't load ideas. Try reloading the page.
    </p>
    <p v-else-if="!ideas.data.value?.length" class="text-ink-soft">
      No ideas yet. When one occurs to you, note it down here, then draft it from there.
    </p>
    <ul v-else class="panel divide-y divide-line">
      <li v-for="idea in ideas.data.value" :key="idea.id">
        <RouterLink
          :to="{ name: 'idea', params: { profileId, id: idea.id } }"
          class="flex items-baseline justify-between gap-3 px-4 py-3 no-underline hover:bg-sunken"
        >
          <span class="text-lg font-semibold">{{ idea.name }}</span>
          <span class="meta shrink-0">
            {{ idea.draftCount }} {{ idea.draftCount === 1 ? 'draft' : 'drafts' }}
          </span>
        </RouterLink>
      </li>
    </ul>
  </ProfileGate>
</template>
