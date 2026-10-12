<script setup lang="ts">
import { MAX_VENUE_SAMPLES, type VenueSample } from '@lfwa/core'
import { useMutation } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { api } from '../lib/api'
import { displayHost } from '../lib/useProfiles'
import SaveStatus from './SaveStatus.vue'
import TextAreaField from './TextAreaField.vue'

type ReadSample = Extract<VenueSample, { ok: true }>

/**
 * Choosing and reading the sample posts a venue's description can be drafted from: the venue's recent posts to
 * tick, and/or links to paste, at most five in all. It makes the server fetch pages (a chore, no AI), so it waits
 * for buttons, and nothing is stored. When the posts have been read, **Use these posts** hands the ones that could
 * be read to whatever is drafting the description.
 */
const props = defineProps<{ profileId: string; siteUrl: string | null }>()
const emit = defineEmits<{ use: [samples: ReadSample[]] }>()

const chosen = ref<string[]>([])
const pasted = ref('')
const results = ref<VenueSample[] | null>(null)

const find = useMutation({
  mutationFn: () =>
    api.venuePosts(props.profileId, props.siteUrl ? { siteUrl: props.siteUrl } : {}),
  onSuccess: () => (chosen.value = []),
})
const posts = computed(() => find.data.value?.posts ?? [])

const pastedUrls = computed(() => pasted.value.split(/\s+/).filter(Boolean))
const urls = computed(() => [...new Set([...chosen.value, ...pastedUrls.value])])
const full = computed(() => urls.value.length >= MAX_VENUE_SAMPLES)
const tooMany = computed(() => urls.value.length > MAX_VENUE_SAMPLES)

const read = useMutation({
  mutationFn: () => api.venueSamples(props.profileId, { urls: urls.value }),
  onSuccess: (answer) => (results.value = answer.samples),
})
const readable = computed(() => (results.value ?? []).filter((s): s is ReadSample => s.ok))

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : ''
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length
</script>

<template>
  <div class="space-y-6">
    <section v-if="siteUrl" aria-labelledby="venue-recent-heading">
      <h3 id="venue-recent-heading" class="mb-2 font-semibold">
        Recent posts on {{ displayHost(siteUrl) }}
      </h3>
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="btn btn-outline"
          :disabled="find.isPending.value"
          @click="find.mutate()"
        >
          {{
            find.isPending.value ? 'Looking…' : find.data.value ? 'Look again' : 'Find recent posts'
          }}
        </button>
        <SaveStatus :mutation="find" saved="" />
      </div>
      <p v-if="find.data.value?.notice" role="status" class="callout mt-3 text-sm">
        {{ find.data.value.notice }}
      </p>
      <fieldset v-if="posts.length" class="mt-3">
        <legend class="mb-1 text-sm text-ink-soft">
          Tick the ones that show what the venue is like (up to {{ MAX_VENUE_SAMPLES }}).
        </legend>
        <ul class="panel divide-y divide-line">
          <li v-for="post in posts" :key="post.url" class="flex items-start gap-3 px-4 py-3">
            <input
              :id="`venue-post-${post.id}`"
              v-model="chosen"
              type="checkbox"
              :value="post.url"
              class="mt-1"
              :disabled="full && !urls.includes(post.url)"
            />
            <div class="min-w-0 flex-1">
              <label :for="`venue-post-${post.id}`" class="break-words font-medium">
                {{ post.title }}
              </label>
              <p class="text-sm text-ink-soft">
                <template v-if="post.publishedAt">{{ when(post.publishedAt) }} · </template>
                <a :href="post.url" target="_blank" rel="noopener noreferrer" class="underline">
                  Open<span class="sr-only"> “{{ post.title }}”</span> in a new tab
                </a>
              </p>
            </div>
          </li>
        </ul>
      </fieldset>
    </section>

    <section aria-labelledby="venue-paste-heading">
      <h3 id="venue-paste-heading" class="mb-2 font-semibold">
        {{ siteUrl ? 'Or paste links to posts' : 'Paste links to posts' }}
      </h3>
      <TextAreaField
        v-model="pasted"
        label="Post links"
        :rows="4"
        hint="One link on each line, to posts that show what the venue is like."
      />
    </section>

    <section aria-labelledby="venue-read-heading">
      <h3 id="venue-read-heading" class="sr-only">Read the posts</h3>
      <p role="status" class="mb-2 text-sm" :class="tooMany ? 'text-danger' : 'text-ink-soft'">
        <template v-if="tooMany">
          That is {{ urls.length }} posts. Choose {{ MAX_VENUE_SAMPLES }} or fewer.
        </template>
        <template v-else>{{ urls.length }} of {{ MAX_VENUE_SAMPLES }} posts chosen.</template>
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!urls.length || tooMany || read.isPending.value"
          @click="read.mutate()"
        >
          {{ read.isPending.value ? 'Reading…' : 'Read these posts' }}
        </button>
        <SaveStatus :mutation="read" saved="" />
      </div>

      <template v-if="results">
        <ul aria-label="Posts read" class="panel mt-3 divide-y divide-line">
          <li v-for="sample in results" :key="sample.url" class="px-4 py-3">
            <template v-if="sample.ok">
              <p class="break-words font-medium">
                <span class="font-bold text-ok" role="img" aria-label="Read">✓</span>
                {{ sample.title ?? sample.url }}
              </p>
              <p class="text-sm text-ink-soft">
                {{ wordCount(sample.text) }} words<template v-if="sample.truncated">
                  (the start of a long post)</template
                >
              </p>
            </template>
            <template v-else>
              <p class="break-all font-medium">
                <span class="font-bold text-danger" role="img" aria-label="Couldn’t be read"
                  >✗</span
                >
                {{ sample.url }}
              </p>
              <p class="text-sm text-danger">{{ sample.message }}</p>
            </template>
          </li>
        </ul>
        <button
          type="button"
          class="btn btn-primary mt-3"
          :disabled="!readable.length"
          @click="emit('use', readable)"
        >
          Use these posts
        </button>
        <p v-if="!readable.length" class="mt-2 text-sm text-ink-soft">
          None of those could be read. Change the links above and read them again.
        </p>
      </template>
    </section>
  </div>
</template>
