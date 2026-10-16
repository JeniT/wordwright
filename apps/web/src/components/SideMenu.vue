<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useNav } from '../lib/nav'
import { displayHost } from '../lib/usePublications'
import PublicationImage from './PublicationImage.vue'
import SettingsButton from './SettingsButton.vue'

/**
 * The menu that follows you. At home it lists Publications; inside a publication, that publication's
 * numbered steps; inside an idea, the idea's. Each level's settings are a gear button beside its name. A "back up" link and the thing's name sit at the top. The numbers
 * orient and never lock: every step is a link. docs/design.md explains the pattern.
 */
const { level, publication, idea, steps, stepKey, loading } = useNav()

const sharedWith = () => {
  const others = (publication.value?.members.length ?? 1) - 1
  return others > 0 ? `Shared with ${others} ${others === 1 ? 'person' : 'people'}` : ''
}

const itemClass =
  'flex min-h-11 items-center rounded-ctl px-3 py-1.5 no-underline hover:bg-sunken aria-[current=page]:bg-accent-wash aria-[current=page]:font-semibold aria-[current=page]:shadow-[inset_3px_0_0_var(--color-accent)]'
</script>

<template>
  <!-- Where you are: a way back up, and the name of the publication or idea. -->
  <div v-if="level === 'publication'" class="px-5 pb-4">
    <RouterLink :to="{ name: 'home' }" class="link text-sm">← All publications</RouterLink>
    <div v-if="publication" class="mt-3 flex items-center gap-3">
      <PublicationImage
        :id="publication.id"
        :name="publication.name"
        :image-url="publication.imageUrl"
        :site-icon-url="publication.siteIconUrl"
        size="xs"
      />
      <div class="min-w-0 flex-1">
        <p class="leading-tight font-semibold break-words">
          <RouterLink
            :to="{ name: 'publication', params: { publicationId: publication.id } }"
            class="no-underline hover:underline aria-[current=page]:underline"
            >{{ publication.name }}</RouterLink
          >
        </p>
        <p v-if="publication.siteUrl" class="meta truncate">
          <a :href="publication.siteUrl" target="_blank" rel="noopener noreferrer" class="link">
            {{ displayHost(publication.siteUrl) }}
            <span class="sr-only">(opens in a new tab)</span>
          </a>
        </p>
        <p v-if="sharedWith()" class="meta">{{ sharedWith() }}</p>
      </div>
      <SettingsButton
        :to="{ name: 'publication-settings', params: { publicationId: publication.id } }"
        label="Publication settings"
      />
    </div>
  </div>
  <div v-else-if="level === 'idea'" class="px-5 pb-4">
    <RouterLink
      v-if="publication"
      :to="{ name: 'publication', params: { publicationId: publication.id } }"
      class="link text-sm break-words"
    >
      ← {{ publication.name }}
    </RouterLink>
    <p class="meta mt-3">Idea</p>
    <div v-if="idea.data.value" class="flex items-center gap-2">
      <p class="min-w-0 flex-1 leading-snug font-semibold break-words">
        <RouterLink
          :to="{
            name: 'idea',
            params: { publicationId: idea.data.value.publicationId, id: idea.data.value.id },
          }"
          class="no-underline hover:underline aria-[current=page]:underline"
          >{{ idea.data.value.name }}</RouterLink
        >
      </p>
      <SettingsButton
        v-if="publication"
        :to="{
          name: 'idea-settings',
          params: { publicationId: publication.id, id: idea.data.value.id },
        }"
        label="Idea settings"
      />
    </div>
    <p v-else-if="loading || idea.isPending.value" class="meta">Loading…</p>
  </div>

  <nav v-if="level === 'home'" aria-label="Main" class="px-3 pb-3">
    <ul>
      <li>
        <RouterLink :to="{ name: 'home' }" :class="itemClass">Publications</RouterLink>
      </li>
    </ul>
  </nav>

  <nav v-else :aria-label="level === 'idea' ? 'Idea' : 'Publication'" class="px-3 pb-3">
    <!-- An ordered list: that these come in an order is conveyed by the list, so the numbers are decoration. -->
    <ol v-if="!loading">
      <li v-for="step in steps" :key="step.key">
        <RouterLink v-slot="{ href, navigate }" :to="step.to" custom>
          <a
            :href="href"
            :aria-current="step.key === stepKey ? 'page' : undefined"
            :aria-describedby="step.meta ? `step-meta-${step.key}` : undefined"
            class="group flex min-h-12 items-center gap-3 rounded-ctl px-3 py-1.5 no-underline hover:bg-sunken aria-[current=page]:bg-accent-wash aria-[current=page]:shadow-[inset_3px_0_0_var(--color-accent)]"
            @click="navigate"
          >
            <span class="step-num group-aria-[current=page]:step-num-current" aria-hidden="true">{{
              step.number
            }}</span>
            <span class="min-w-0">
              <span
                class="block leading-tight font-medium group-aria-[current=page]:font-semibold"
                >{{ step.label }}</span
              >
              <!-- The count describes the step (read after its name); it isn't part of its name. -->
              <span
                v-if="step.meta"
                :id="`step-meta-${step.key}`"
                class="meta block"
                aria-hidden="true"
                >{{ step.meta }}</span
              >
            </span>
          </a>
        </RouterLink>
      </li>
    </ol>
  </nav>
</template>
