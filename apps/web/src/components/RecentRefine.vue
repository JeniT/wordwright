<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { api } from '../lib/api'
import { holdMessage } from '../lib/pending-message'
import { queryKeys } from '../lib/queries'
import LandingSection from './LandingSection.vue'
import Markdown from './Markdown.vue'
import AiButton from './AiButton.vue'
import QueryState from './QueryState.vue'

/**
 * A summary of an idea's conversation for its landing page: the AI's latest message and a box to answer it, or,
 * before there is a conversation, the invitation to start one. Nothing is sent on arrival: both ways in lead to the
 * Refine page, where the reply is written and shown as it comes.
 */
const props = defineProps<{ publicationId: string; ideaId: string }>()
const router = useRouter()
const SHOWN = 600

// The newest conversation is the one summarised; the Refine page has them all.
const list = useQuery({
  queryKey: computed(() => queryKeys.conversations(props.publicationId, props.ideaId)),
  queryFn: () => api.getConversations(props.publicationId, props.ideaId),
})
const newestId = computed(() => list.data.value?.conversations.at(-1)?.id)
const conversation = useQuery({
  queryKey: computed(() =>
    queryKeys.conversation(props.publicationId, props.ideaId, newestId.value ?? ''),
  ),
  queryFn: () => api.getConversation(props.publicationId, props.ideaId, newestId.value!),
  enabled: computed(() => !!newestId.value),
})
const refineRoute = computed(() => ({
  name: 'brainstorm',
  params: { publicationId: props.publicationId, id: props.ideaId },
}))
const latest = computed(() =>
  [...(conversation.data.value?.messages ?? [])]
    .reverse()
    .find((m) => m.role === 'assistant' && m.kind === 'message' && m.text),
)
/** Nothing said yet: no conversation, or the newest is still empty. */
const empty = computed(
  () =>
    !!list.data.value &&
    (!newestId.value || (!!conversation.data.value && !conversation.data.value.messages.length)),
)

/** The start of a long reply, cut at a paragraph where it can be, so the Markdown stays whole. */
const excerpt = computed(() => {
  const text = latest.value?.text ?? ''
  if (text.length <= SHOWN) return { text, cut: false }
  let out = ''
  for (const paragraph of text.split(/\n{2,}/)) {
    if (out && out.length + paragraph.length > SHOWN) break
    out = out ? `${out}\n\n${paragraph}` : paragraph
  }
  return out.length >= text.length
    ? { text, cut: false }
    : { text: out.length > SHOWN ? `${out.slice(0, SHOWN)}…` : out, cut: true }
})

const message = ref('')
function reply() {
  const text = message.value.trim()
  if (!text) return
  holdMessage(props.publicationId, props.ideaId, text)
  void router.push(refineRoute.value)
}
const start = () => router.push({ ...refineRoute.value, query: { start: '1' } })
</script>

<template>
  <LandingSection
    level="idea"
    step="refine"
    title="Refine"
    explain="Use your AI to help you refine your idea. It will ask you questions and add the points you make to your notes."
  >
    <template #actions>
      <RouterLink :to="refineRoute" class="link text-sm">See all conversations</RouterLink>
    </template>
    <QueryState :query="list" what="the conversation" loading="Loading the conversation…">
      <div v-if="empty" class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <AiButton class="btn btn-primary" @click="start">Refine with your AI</AiButton>
        <p class="min-w-0 flex-1 basis-64 text-sm text-ink-soft">
          This will send this publication’s description and this idea’s title and notes and reading
          list to your AI. It will not send your drafts.
        </p>
      </div>
      <QueryState
        v-else
        :query="conversation"
        what="the conversation"
        loading="Loading the conversation…"
      >
        <div v-if="latest" class="panel-sunken mb-4 p-3">
          <p class="mb-1 text-sm font-medium text-ink-soft">
            Your AI<span v-if="latest.model" class="font-normal"> · {{ latest.model }}</span>
          </p>
          <Markdown :text="excerpt.text" />
          <p v-if="excerpt.cut" class="mt-2 text-sm">
            <RouterLink :to="refineRoute" class="link">Read in full</RouterLink>
          </p>
        </div>
        <p v-else class="mb-4 text-ink-soft">Your AI hasn’t replied yet.</p>
        <form @submit.prevent="reply">
          <label for="landing-reply" class="mb-1 block text-sm font-medium">Your reply</label>
          <textarea
            id="landing-reply"
            v-model="message"
            rows="3"
            class="field mb-2"
            @keydown.enter.ctrl.exact.prevent="reply"
            @keydown.enter.meta.exact.prevent="reply"
          ></textarea>
          <AiButton type="submit" class="btn btn-outline" :disabled="!message.trim()"
            >Send</AiButton
          >
        </form>
      </QueryState>
    </QueryState>
  </LandingSection>
</template>
