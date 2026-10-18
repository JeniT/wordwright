<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import Explain from '../components/Explain.vue'
import IdeaGate from '../components/IdeaGate.vue'
import LandingSection from '../components/LandingSection.vue'
import QuickAdd from '../components/QuickAdd.vue'
import RecentNotes from '../components/RecentNotes.vue'
import RecentReading from '../components/RecentReading.vue'
import RecentRefine from '../components/RecentRefine.vue'
import ResearchForm from '../components/ResearchForm.vue'
import SettingsButton from '../components/SettingsButton.vue'
import RowList from '../components/RowList.vue'
import StartDraftButton from '../components/StartDraftButton.vue'
import { usePublication } from '../lib/usePublications'

/**
 * An idea's landing page: a short summary of each of its steps, with the quick action for each. It is not a
 * numbered step, so nothing in the menu is current here. Visiting spends nothing: the AI is only asked when the
 * writer presses Research.
 */
const props = defineProps<{ publicationId: string; id: string }>()
const router = useRouter()
const { publication } = usePublication(() => props.publicationId)

const showResearch = () =>
  router.push({
    name: 'idea-research',
    params: { publicationId: props.publicationId, id: props.id },
  })
</script>

<template>
  <IdeaGate :id="id" v-slot="{ idea }" :publication-id="publicationId">
    <div class="mb-2">
      <p v-if="publication" class="meta mb-1 break-words">
        <RouterLink :to="{ name: 'publication', params: { publicationId } }" class="link">
          {{ publication.name }}
        </RouterLink>
      </p>
      <div class="flex items-center gap-2">
        <h1 class="h1 break-words">{{ idea.name }}</h1>
        <SettingsButton
          :to="{ name: 'idea-settings', params: { publicationId, id } }"
          label="Idea settings"
        />
      </div>
    </div>

    <Explain tutorial-only class="mt-4">
      This is your idea’s home. Gather reading and notes, ask your AI to research and refine it,
      then start a draft.
    </Explain>

    <QuickAdd
      v-if="publication"
      class="mt-6"
      in-place
      :publications="[publication]"
      :idea-id="id"
    />

    <LandingSection
      level="idea"
      step="research"
      title="Research"
      explain="Describe the areas you want to look into and your AI will suggest pages worth reading, including some that may not agree with you. Nothing joins the reading list until you add it."
    >
      <template #actions>
        <RouterLink
          :to="{ name: 'idea-research', params: { publicationId, id } }"
          class="link text-sm"
        >
          See all research
        </RouterLink>
      </template>
      <ResearchForm
        class="max-w-2xl"
        :publication-id="publicationId"
        :idea-id="id"
        @done="showResearch"
      />
    </LandingSection>

    <RecentReading
      :publication-id="publicationId"
      :idea-id="id"
      explain="Read the articles on this idea’s reading list and take notes on them. Items can be tagged and moved to another idea."
      :to="{ name: 'idea-read', params: { publicationId, id } }"
    />

    <RecentNotes
      :publication-id="publicationId"
      :idea-id="id"
      explain="Review, tag and arrange your notes. They are what you draw on when you write."
      :to="{ name: 'idea-notes', params: { publicationId, id } }"
    />

    <RecentRefine :publication-id="publicationId" :idea-id="id" />

    <LandingSection
      level="idea"
      step="draft"
      title="Draft"
      explain="Write in the editor, where you can also ask for a critique or rephrase a passage. The words are always yours."
    >
      <template #actions>
        <RouterLink
          :to="{ name: 'idea-drafts', params: { publicationId, id } }"
          class="link text-sm"
        >
          See all drafts
        </RouterLink>
        <StartDraftButton :publication-id="publicationId" :idea-id="id" />
      </template>
      <p v-if="!idea.drafts.length" class="text-ink-soft">
        No drafts yet. Start one when you’re ready to write.
      </p>
      <RowList v-else :items="idea.drafts" label="Drafts" ordered bare>
        <template #default="{ item: draft }">
          <RouterLink
            :to="{ name: 'draft', params: { publicationId, id: draft.id } }"
            class="flex items-baseline justify-between gap-3 px-4 py-3 no-underline hover:bg-sunken"
          >
            <span class="font-semibold break-words">{{ draft.title || 'Untitled' }}</span>
            <time class="meta shrink-0" :datetime="draft.updatedAt">
              {{ new Date(draft.updatedAt).toLocaleDateString() }}
            </time>
          </RouterLink>
        </template>
      </RowList>
    </LandingSection>
  </IdeaGate>
</template>
