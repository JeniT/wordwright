<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Explain from '../components/Explain.vue'
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
const llm = useQuery({ queryKey: queryKeys.llm(), queryFn: () => api.getLlmSettings() })
const justConnected = ref(false)
// Both are known before the checklist shows, so it never flashes for someone who is already set up.
const hasPublication = computed(() => !!publications.data.value?.length)
const hasKey = computed(() => !!llm.data.value?.hasKey)
const loaded = computed(() => !!publications.data.value && (!!llm.data.value || llm.isError.value))
// Known to be empty (not merely still loading), so the list's own heading row gives way to the checklist.
const noneYet = computed(() => !!publications.data.value && !hasPublication.value)
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
    <h2 id="setup-heading" class="mb-2 font-display text-xl font-semibold">Get started</h2>
    <Explain tutorial-only class="mb-2">
      Wordwright helps you judge your own writing, and never writes it for you. These two steps set
      up a place to keep your work and your own AI.
    </Explain>
    <ol class="mt-4 space-y-6">
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
          <div v-if="!hasPublication" class="mt-2 flex flex-wrap items-center gap-3">
            <RouterLink :to="{ name: 'new-publication' }" class="btn btn-primary"
              >New publication</RouterLink
            >
            <Explain label="About publications"
              >A publication is a place you publish, like a Substack or a blog.</Explain
            >
          </div>
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
    <!-- With none yet, the checklist above is the page: the heading stays for screen readers (it names the page)
         and the button is the checklist's first step. -->
    <div :class="noneYet ? 'sr-only' : 'mb-6 flex items-center justify-between gap-4'">
      <h1 id="publications-heading" class="font-display text-2xl font-semibold">
        Your publications
      </h1>
      <RouterLink v-if="hasPublication" :to="{ name: 'new-publication' }" class="btn btn-primary"
        >New publication</RouterLink
      >
    </div>

    <Explain v-if="!needsSetup" tutorial-only class="mb-4">
      Open a publication to work on its ideas and drafts.
    </Explain>
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
