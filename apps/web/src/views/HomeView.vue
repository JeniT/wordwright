<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import LlmSettingsSection from '../components/LlmSettingsSection.vue'
import ProfileImage from '../components/ProfileImage.vue'
import UsernameSection from '../components/UsernameSection.vue'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queries'
import { displayHost, useProfiles } from '../lib/useProfiles'
import { useSessionStore } from '../stores/session'
import QueryState from '../components/QueryState.vue'

const session = useSessionStore()
const profiles = useProfiles()
// Shares the cache with the setup form, which updates it when a key is saved.
const llm = useQuery({ queryKey: ['llm'], queryFn: () => api.getLlmSettings() })
const justConnected = ref(false)
// Drafts other people have asked this person to read and comment on (a member of a profile may be asked to).
const reviews = useQuery({ queryKey: queryKeys.reviews(), queryFn: () => api.listReviews() })
const toReview = computed(() => (reviews.data.value ?? []).filter((r) => r.state === 'open'))
</script>

<template>
  <!-- Sign-ups through Google are given a username; ask once whether they'd like another. -->
  <div v-if="session.user && !session.user.handleChosen" class="mb-10 panel p-5">
    <UsernameSection prompt />
  </div>
  <div v-if="llm.data.value && !llm.data.value.hasKey" class="mb-10 panel p-5">
    <p v-if="session.user && !profiles.data.value?.length" class="mb-4 font-display text-lg">
      Welcome, {{ session.user.name }}. Two quick steps and you're ready to write.
    </p>
    <LlmSettingsSection guide @saved="justConnected = true" />
  </div>
  <p v-else-if="justConnected" role="status" class="mb-6 rounded-ctl bg-sunken p-3 text-sm">
    Your Anthropic key is saved. Wordwright is ready to use.
  </p>

  <section v-if="toReview.length" class="mb-10 panel p-5" aria-labelledby="to-review-heading">
    <h2 id="to-review-heading" class="mb-2 font-display text-xl font-semibold">Drafts to review</h2>
    <ul class="space-y-1">
      <li v-for="r in toReview" :key="r.id">
        <RouterLink :to="{ name: 'review', params: { id: r.id } }" class="link">{{
          r.draftTitle || 'Untitled draft'
        }}</RouterLink>
        <span class="meta">
          · {{ r.profileName
          }}<template v-if="r.inviterName"> · asked by {{ r.inviterName }}</template></span
        >
      </li>
    </ul>
  </section>

  <section aria-labelledby="profiles-heading">
    <div class="mb-6 flex items-center justify-between gap-4">
      <h1 id="profiles-heading" class="font-display text-2xl font-semibold">Your profiles</h1>
      <RouterLink :to="{ name: 'new-profile' }" class="btn btn-primary">New profile</RouterLink>
    </div>

    <QueryState :query="profiles" what="your profiles">
      <div
        v-if="!profiles.data.value?.length"
        class="rounded-ctl border border-dashed border-line-strong p-8 text-center"
      >
        <p class="font-display text-lg">Next, create your first profile</p>
        <p class="mx-auto mt-2 max-w-md text-ink-soft">
          A profile is a place you publish, like a Substack or a blog. It keeps its own ideas,
          readers and drafts together. You can give it a name, a website and a picture, and share it
          with others later.
        </p>
        <RouterLink :to="{ name: 'new-profile' }" class="btn btn-primary mt-4 inline-block">
          Create your first profile
        </RouterLink>
      </div>
      <ul v-else class="grid gap-4 sm:grid-cols-2">
        <li v-for="p in profiles.data.value" :key="p.id">
          <RouterLink
            :to="{ name: 'profile', params: { profileId: p.id } }"
            class="flex h-full items-center gap-4 rounded-panel border border-line bg-surface p-4 hover:border-accent"
          >
            <ProfileImage :id="p.id" :name="p.name" :image-url="p.imageUrl" />
            <span class="min-w-0">
              <span class="block truncate font-display text-lg font-semibold">{{ p.name }}</span>
              <span v-if="p.siteUrl" class="block truncate text-sm text-ink-soft">
                {{ displayHost(p.siteUrl) }}
              </span>
              <span v-if="p.members.length > 1" class="block text-sm text-ink-soft">
                Shared with {{ p.members.length - 1 }}
                {{ p.members.length === 2 ? 'person' : 'people' }}
              </span>
            </span>
          </RouterLink>
        </li>
      </ul>
    </QueryState>
  </section>
</template>
