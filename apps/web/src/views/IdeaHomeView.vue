<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import IdeaGate from '../components/IdeaGate.vue'
import LandingSection from '../components/LandingSection.vue'
import RecentNotes from '../components/RecentNotes.vue'
import RecentReading from '../components/RecentReading.vue'
import RecentRefine from '../components/RecentRefine.vue'
import ResearchForm from '../components/ResearchForm.vue'
import StartDraftButton from '../components/StartDraftButton.vue'
import { useProfile } from '../lib/useProfiles'

/**
 * An idea's landing page: a short summary of each of its steps, with the quick action for each. It is not a
 * numbered step, so nothing in the menu is current here. Visiting spends nothing: the AI is only asked when the
 * writer presses Research.
 */
const props = defineProps<{ profileId: string; id: string }>()
const router = useRouter()
const { profile } = useProfile(() => props.profileId)

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const showResearch = () =>
  router.push({ name: 'research', params: { profileId: props.profileId, id: props.id } })
</script>

<template>
  <IdeaGate :id="id" v-slot="{ idea }" :profile-id="profileId">
    <div class="mb-2">
      <p v-if="profile" class="meta mb-1 break-words">
        <RouterLink :to="{ name: 'profile', params: { profileId } }" class="link">
          {{ profile.name }}
        </RouterLink>
      </p>
      <h1 class="h1 break-words">{{ idea.name }}</h1>
    </div>

    <!-- Unread reading comes first; the AI box is for when there is nothing left to read. -->
    <RecentReading
      v-if="idea.links.some((link) => !link.readAt)"
      :profile-id="profileId"
      :idea-id="id"
      step="research"
      title="Research"
      :to="{ name: 'idea-research', params: { profileId, id } }"
    />
    <LandingSection v-else level="idea" step="research" title="Research">
      <template #actions>
        <RouterLink :to="{ name: 'idea-research', params: { profileId, id } }" class="link text-sm">
          See the reading list<span class="meta">
            ({{ plural(idea.links.length, 'source', 'sources') }})</span
          >
        </RouterLink>
      </template>
      <p class="mb-4 max-w-prose text-sm text-ink-soft">
        Your AI searches the web for pages worth reading, including some that may not agree with
        you, and you choose what goes on the reading list. The idea’s title and notes, the addresses
        already on its reading list and what you write here are sent to your AI provider; the text
        of your drafts never is.
      </p>
      <ResearchForm class="max-w-2xl" :profile-id="profileId" :idea-id="id" @done="showResearch" />
    </LandingSection>

    <RecentNotes
      :profile-id="profileId"
      :idea-id="id"
      :to="{ name: 'idea-notes', params: { profileId, id } }"
    />

    <RecentRefine :profile-id="profileId" :idea-id="id" />

    <LandingSection level="idea" step="draft" title="Draft">
      <template #actions>
        <RouterLink :to="{ name: 'idea-drafts', params: { profileId, id } }" class="link text-sm">
          See all drafts<span v-if="idea.drafts.length" class="meta">
            ({{ idea.drafts.length }})</span
          >
        </RouterLink>
        <StartDraftButton :profile-id="profileId" :idea-id="id" label="Start a draft" />
      </template>
      <p v-if="!idea.drafts.length" class="text-ink-soft">
        No drafts yet. Start one when you’re ready to write.
      </p>
      <ol v-else class="panel divide-y divide-line" aria-label="Drafts">
        <li v-for="draft in idea.drafts" :key="draft.id">
          <RouterLink
            :to="{ name: 'draft', params: { profileId, id: draft.id } }"
            class="flex items-baseline justify-between gap-3 px-4 py-3 no-underline hover:bg-sunken"
          >
            <span class="font-semibold break-words">{{ draft.title || 'Untitled' }}</span>
            <time class="meta shrink-0" :datetime="draft.updatedAt">
              {{ new Date(draft.updatedAt).toLocaleDateString() }}
            </time>
          </RouterLink>
        </li>
      </ol>
    </LandingSection>
  </IdeaGate>
</template>
