<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { api } from '../lib/api'
import { holdMessage } from '../lib/pending-message'
import { queryKeys } from '../lib/queries'
import LandingSection from './LandingSection.vue'
import Markdown from './Markdown.vue'
import QueryState from './QueryState.vue'

/**
 * A summary of an idea's conversation for its landing page: the AI's latest message and a box to answer it, or,
 * before there is a conversation, the invitation to start one. Nothing is sent on arrival: both ways in lead to the
 * Refine page, where the reply is written and shown as it comes.
 */
const props = defineProps<{ profileId: string; ideaId: string }>()
const router = useRouter()
const SHOWN = 600

const conversation = useQuery({
  queryKey: computed(() => queryKeys.conversation(props.profileId, props.ideaId)),
  queryFn: () => api.getConversation(props.profileId, props.ideaId),
})
const refineRoute = computed(() => ({
  name: 'brainstorm',
  params: { profileId: props.profileId, id: props.ideaId },
}))
const latest = computed(() =>
  [...(conversation.data.value?.messages ?? [])]
    .reverse()
    .find((m) => m.role === 'assistant' && m.kind === 'message' && m.text),
)
const empty = computed(() => !!conversation.data.value && !conversation.data.value.messages.length)

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
  holdMessage(props.profileId, props.ideaId, text)
  void router.push(refineRoute.value)
}
const start = () => router.push({ ...refineRoute.value, query: { start: '1' } })
</script>

<template>
  <LandingSection level="idea" step="refine" title="Refine">
    <template #actions>
      <RouterLink :to="refineRoute" class="link text-sm">Open the conversation</RouterLink>
    </template>
    <QueryState :query="conversation" what="the conversation" loading="Loading the conversation…">
      <div v-if="empty">
        <h3 class="mb-1 font-semibold">Talk it through</h3>
        <p class="mb-3 max-w-prose text-ink-soft">
          Your AI will open by asking the questions that matter most for this idea, and you answer.
          It adds the points you make to the idea’s notes as you go, and can suggest a sharper title
          or a separate new idea, but only you decide on those. Your idea, its notes and links, and
          this publication’s details are sent to your AI provider; the text of your drafts never is.
        </p>
        <button type="button" class="btn btn-primary" @click="start">Start brainstorming</button>
      </div>
      <template v-else>
        <div v-if="latest" class="panel-sunken mb-4 p-3">
          <p class="mb-1 text-sm font-medium text-ink-soft">
            Coach<span v-if="latest.model" class="font-normal"> · {{ latest.model }}</span>
          </p>
          <Markdown :text="excerpt.text" />
          <p v-if="excerpt.cut" class="mt-2 text-sm">
            <RouterLink :to="refineRoute" class="link">Read in full</RouterLink>
          </p>
        </div>
        <p v-else class="mb-4 text-ink-soft">
          Your coach hasn’t replied yet.
          <RouterLink :to="refineRoute" class="link">Open the conversation</RouterLink>
        </p>
        <form @submit.prevent="reply">
          <label for="landing-reply" class="mb-1 block text-sm font-medium">Your reply</label>
          <textarea
            id="landing-reply"
            v-model="message"
            rows="3"
            class="field mb-2"
            aria-describedby="landing-reply-hint"
            @keydown.enter.ctrl.exact.prevent="reply"
            @keydown.enter.meta.exact.prevent="reply"
          ></textarea>
          <p id="landing-reply-hint" class="mb-2 text-sm text-ink-soft">
            Sending takes you to the conversation, where your reply is written.
          </p>
          <button type="submit" class="btn btn-outline" :disabled="!message.trim()">Send</button>
        </form>
      </template>
    </QueryState>
  </LandingSection>
</template>
