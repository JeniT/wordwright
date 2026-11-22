<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import { computed, onMounted, ref, useId } from 'vue'
import { RouterLink } from 'vue-router'
import { RESEARCH_AREAS_MAX, RESEARCH_IN_FLIGHT_MAX, type ResearchRun } from '@wordwright/core'
import { api, errorMessage } from '../lib/api'
import { keyProblemOf } from '../lib/key-problem'
import { invalidateRoots } from '../lib/queries'
import {
  atSearchLimit,
  forgetFinished,
  forgetSearch,
  searchesFor,
  trackSearch,
  type ResearchSearch,
} from '../lib/research-searches'
import AiButton from './AiButton.vue'
import AiProblemAlert from './AiProblemAlert.vue'
import Icon from './Icon.vue'

/**
 * The box for asking the AI to research an idea, shared by the Research page and the idea's landing page. Nothing
 * is sent until the button is pressed. Several searches can run at once (#446): the box is cleared and ready again
 * as soon as one is sent, and each search is listed below it with its own wait or error. `done` fires as each run is
 * saved, so the page can show it. On the Research page, which lists every run, a finished search leaves the list;
 * with `keep-finished` (the landing page) it stays, with a link to what it found, until the writer removes it.
 */
const props = defineProps<{ publicationId: string; ideaId: string; keepFinished?: boolean }>()
const emit = defineEmits<{ done: [run: ResearchRun] }>()
const queryClient = useQueryClient()
const fieldId = useId()

const areas = ref('')
const mine = computed(() => searchesFor(props.publicationId, props.ideaId).toReversed()) // newest first
const full = computed(() => atSearchLimit(props.publicationId))
const searching = computed(() => mine.value.some((s) => s.state === 'searching'))
const announcement = ref('')

onMounted(() => {
  if (!props.keepFinished) forgetFinished(props.publicationId, props.ideaId)
})

async function send(text: string, again?: ResearchSearch) {
  announcement.value = 'Searching the web. This can take up to a minute.'
  const { publicationId, ideaId } = props
  const run = await trackSearch(
    { publicationId, ideaId, areas: text },
    () => api.runResearch(publicationId, ideaId, text),
    again,
  )
  // Another member may have researched too, so read the whole list again.
  void invalidateRoots(queryClient, 'research')
  if (!run) return // the search shows its own error
  announcement.value = `Research finished: “${text}”.`
  if (!props.keepFinished) {
    const search = searchesFor(publicationId, ideaId).find((s) => s.run?.id === run.id)
    if (search) forgetSearch(search.key)
  }
  emit('done', run)
}

function submit() {
  const text = areas.value.trim()
  if (!text || full.value) return
  areas.value = ''
  void send(text)
}

const found = (run: ResearchRun | null) => {
  const n = run?.items.length ?? 0
  return n === 0
    ? 'Nothing worth reading turned up.'
    : n === 1
      ? 'Found 1 page.'
      : `Found ${n} pages.`
}
</script>

<template>
  <form @submit.prevent="submit">
    <label :for="fieldId" class="mb-1 block text-sm font-medium">
      What areas do you want to research?
    </label>
    <textarea
      :id="fieldId"
      v-model="areas"
      rows="4"
      :maxlength="RESEARCH_AREAS_MAX"
      :aria-describedby="`${fieldId}-hint`"
      class="field mb-2"
      @keydown.enter.ctrl.exact.prevent="submit"
      @keydown.enter.meta.exact.prevent="submit"
    ></textarea>
    <p :id="`${fieldId}-hint`" class="mb-2 text-sm text-ink-soft">
      For example: how fast river bends move, and what engineers have learned from straightening
      rivers.
    </p>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <AiButton
        type="submit"
        class="btn btn-primary"
        :disabled="!areas.trim() || full"
        :aria-describedby="full ? `${fieldId}-full` : undefined"
      >
        Research
      </AiButton>
      <p class="min-w-0 flex-1 basis-64 text-sm text-ink-soft">
        This will send this publication’s description and this idea’s title and notes, articles, and
        the areas you want to research to your AI. It will not send your drafts.
      </p>
    </div>
    <p v-if="full" :id="`${fieldId}-full`" class="mt-2">
      {{ RESEARCH_IN_FLIGHT_MAX }} searches are running. You can send another when one finishes.
    </p>

    <template v-if="mine.length">
      <ul
        class="mt-4 divide-y divide-line rounded-ctl border border-line bg-surface"
        aria-label="Searches"
      >
        <li v-for="search in mine" :key="search.key" class="px-4 py-3">
          <p class="line-clamp-2 font-medium break-words">“{{ search.areas }}”</p>
          <p
            v-if="search.state === 'searching'"
            class="mt-1 flex items-center gap-2 text-sm text-ink-soft"
          >
            <Icon name="working" class="shrink-0 motion-safe:animate-spin" />
            Searching the web. This can take up to a minute.
          </p>
          <template v-else-if="search.state === 'failed'">
            <AiProblemAlert
              class="mt-2"
              :message="errorMessage(search.error)"
              :key-problem="keyProblemOf(search.error)"
            />
            <div class="mt-2 flex flex-wrap gap-2">
              <AiButton
                class="btn btn-sm btn-outline"
                :disabled="full"
                @click="send(search.areas, search)"
              >
                Try again
              </AiButton>
              <button type="button" class="btn btn-sm btn-quiet" @click="forgetSearch(search.key)">
                Remove
              </button>
            </div>
          </template>
          <div v-else class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span>{{ found(search.run) }}</span>
            <RouterLink
              :to="{
                name: 'idea-research',
                params: { publicationId, id: ideaId },
                query: { run: search.run?.id },
              }"
              class="link"
            >
              See the research
            </RouterLink>
            <button type="button" class="btn btn-sm btn-quiet" @click="forgetSearch(search.key)">
              Remove
            </button>
          </div>
        </li>
      </ul>
      <p v-if="searching" class="mt-2 text-sm text-ink-soft">
        You can keep working while it searches. Closing or reloading this tab stops the search.
      </p>
    </template>
    <p aria-live="polite" class="sr-only">{{ announcement }}</p>
  </form>
</template>
