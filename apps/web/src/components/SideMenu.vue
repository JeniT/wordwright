<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useNav } from '../lib/nav'
import { displayHost } from '../lib/useProfiles'
import ProfileImage from './ProfileImage.vue'

/**
 * The menu that follows you. At home it lists Profiles and Account settings; inside a profile, that profile's
 * numbered steps; inside an idea, the idea's. A "back up" link and the thing's name sit at the top. The numbers
 * orient and never lock: every step is a link. docs/design.md explains the pattern.
 */
const { level, profile, idea, steps, stepKey, loading } = useNav()

const sharedWith = () => {
  const others = (profile.value?.members.length ?? 1) - 1
  return others > 0 ? `Shared with ${others} ${others === 1 ? 'person' : 'people'}` : ''
}

const itemClass =
  'flex min-h-11 items-center rounded-ctl px-3 py-1.5 no-underline hover:bg-sunken aria-[current=page]:bg-accent-wash aria-[current=page]:font-semibold aria-[current=page]:shadow-[inset_3px_0_0_var(--color-accent)]'
</script>

<template>
  <!-- Where you are: a way back up, and the name of the profile or idea. -->
  <div v-if="level === 'profile'" class="px-5 pb-4">
    <RouterLink :to="{ name: 'home' }" class="link text-sm">← All profiles</RouterLink>
    <div v-if="profile" class="mt-3 flex items-center gap-3">
      <ProfileImage :id="profile.id" :name="profile.name" :image-url="profile.imageUrl" size="xs" />
      <div class="min-w-0">
        <p class="leading-tight font-semibold break-words">{{ profile.name }}</p>
        <p v-if="profile.siteUrl" class="meta truncate">
          <a :href="profile.siteUrl" target="_blank" rel="noopener noreferrer" class="link">
            {{ displayHost(profile.siteUrl) }}
            <span class="sr-only">(opens in a new tab)</span>
          </a>
        </p>
        <p v-if="sharedWith()" class="meta">{{ sharedWith() }}</p>
      </div>
    </div>
  </div>
  <div v-else-if="level === 'idea'" class="px-5 pb-4">
    <RouterLink
      v-if="profile"
      :to="{ name: 'profile-ideas', params: { profileId: profile.id } }"
      class="link text-sm break-words"
    >
      ← {{ profile.name }}
    </RouterLink>
    <p class="meta mt-3">Idea</p>
    <p v-if="idea.data.value" class="leading-snug font-semibold break-words">
      {{ idea.data.value.name }}
    </p>
    <p v-else-if="loading || idea.isPending.value" class="meta">Loading…</p>
  </div>

  <nav v-if="level === 'home'" aria-label="Main" class="px-3 pb-3">
    <ul>
      <li>
        <RouterLink :to="{ name: 'home' }" :class="itemClass">Profiles</RouterLink>
      </li>
      <li>
        <RouterLink :to="{ name: 'account' }" :class="itemClass">Account settings</RouterLink>
      </li>
    </ul>
  </nav>

  <nav v-else :aria-label="level === 'idea' ? 'Idea' : 'Profile'" class="px-3 pb-3">
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
    <ul v-if="profile" class="mt-3 border-t border-line pt-3">
      <li v-if="level === 'profile'">
        <RouterLink
          :to="{ name: 'profile-settings', params: { profileId: profile.id } }"
          :class="itemClass"
          >Profile settings</RouterLink
        >
      </li>
      <li v-else-if="idea.data.value">
        <RouterLink
          :to="{ name: 'idea-settings', params: { profileId: profile.id, id: idea.data.value.id } }"
          :class="itemClass"
          >Idea settings</RouterLink
        >
      </li>
    </ul>
  </nav>
</template>
