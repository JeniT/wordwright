<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Icon from '../components/Icon.vue'
import LlmSettingsSection from '../components/LlmSettingsSection.vue'
import PublicationImage from '../components/PublicationImage.vue'
import UsernameSection from '../components/UsernameSection.vue'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queries'
import { displayHost, usePublications } from '../lib/usePublications'
import { useSessionStore } from '../stores/session'
import QueryState from '../components/QueryState.vue'

const session = useSessionStore()
const publications = usePublications()
// Shares the cache with the setup form, which updates it when a key is saved.
const llm = useQuery({ queryKey: ['llm'], queryFn: () => api.getLlmSettings() })
const justConnected = ref(false)
// Both are known before the checklist shows, so it never flashes for someone who is already set up.
const hasPublication = computed(() => !!publications.data.value?.length)
const hasKey = computed(() => !!llm.data.value?.hasKey)
const loaded = computed(() => !!publications.data.value && (!!llm.data.value || llm.isError.value))
const needsSetup = computed(() => loaded.value && (!hasPublication.value || !hasKey.value))
// Drafts other people have asked this person to read and comment on (a member of a publication may be asked to).
const reviews = useQuery({ queryKey: queryKeys.reviews(), queryFn: () => api.listReviews() })
const toReview = computed(() => (reviews.data.value ?? []).filter((r) => r.state === 'open'))
</script>

<template>
  <!-- Sign-ups through Google are given a username; ask once whether they'd like another. -->
  <div v-if="session.user && !session.user.handleChosen" class="mb-10 panel p-5">
    <UsernameSection prompt />
  </div>
  <!-- First run: two steps that never block each other. Gone once both are done. -->
  <section v-if="needsSetup" class="mb-10 panel p-5" aria-labelledby="setup-heading">
    <h2 id="setup-heading" class="mb-4 font-display text-xl font-semibold">
      <template v-if="!hasPublication && !hasKey"
        >Welcome<template v-if="session.user">, {{ session.user.name }}</template
        >. Two steps to get going</template
      >
      <template v-else>One more step to get going</template>
    </h2>
    <ol class="space-y-6">
      <li class="flex items-start gap-4" data-step="publication">
        <span
          class="step-num step-num-lg"
          :class="{ 'step-num-current': hasPublication }"
          aria-hidden="true"
          >{{ hasPublication ? '' : '01' }}<Icon v-if="hasPublication" name="check" :size="18"
        /></span>
        <div class="min-w-0 flex-1">
          <h3 class="font-display text-lg font-semibold">
            Create your first publication<span v-if="hasPublication" class="meta"> · done</span>
          </h3>
          <template v-if="!hasPublication">
            <p class="mt-1 text-ink-soft">
              A publication is a place you publish, like a Substack or a blog. It keeps its own
              ideas, readers and drafts together.
            </p>
            <RouterLink :to="{ name: 'new-publication' }" class="btn btn-primary mt-3 inline-block">
              Start a publication
            </RouterLink>
          </template>
        </div>
      </li>
      <li class="flex items-start gap-4" data-step="key">
        <span
          class="step-num step-num-lg"
          :class="{ 'step-num-current': hasKey }"
          aria-hidden="true"
          >{{ hasKey ? '' : '02' }}<Icon v-if="hasKey" name="check" :size="18"
        /></span>
        <div class="min-w-0 flex-1">
          <QueryState v-if="llm.isError.value" :query="llm" what="your AI key settings" />
          <template v-else-if="!hasKey">
            <LlmSettingsSection guide @saved="justConnected = true" />
            <p class="mt-3 text-sm text-ink-soft">
              You can do the steps in either order. Without a key, publications, ideas and notes
              still work; the AI features ask you to connect one.
            </p>
          </template>
          <template v-else>
            <h3 class="font-display text-lg font-semibold">
              Connect your AI key (Anthropic)<span class="meta"> · done</span>
            </h3>
            <p v-if="justConnected" role="status" class="mt-1 text-sm">
              Your Anthropic key is saved. Wordwright is ready to use.
            </p>
          </template>
        </div>
      </li>
    </ol>
  </section>
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
          · {{ r.publicationName
          }}<template v-if="r.inviterName"> · asked by {{ r.inviterName }}</template></span
        >
      </li>
    </ul>
  </section>

  <section aria-labelledby="publications-heading">
    <div class="mb-6 flex items-center justify-between gap-4">
      <h1 id="publications-heading" class="font-display text-2xl font-semibold">
        Your publications
      </h1>
      <RouterLink :to="{ name: 'new-publication' }" class="btn btn-primary"
        >New publication</RouterLink
      >
    </div>

    <QueryState :query="publications" what="your publications">
      <ul v-if="publications.data.value?.length" class="grid gap-4 sm:grid-cols-2">
        <li v-for="p in publications.data.value" :key="p.id">
          <RouterLink
            :to="{ name: 'publication', params: { publicationId: p.id } }"
            class="flex h-full items-center gap-4 rounded-panel border border-line bg-surface p-4 hover:border-accent"
          >
            <PublicationImage
              :id="p.id"
              :name="p.name"
              :image-url="p.imageUrl"
              :site-icon-url="p.siteIconUrl"
            />
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
