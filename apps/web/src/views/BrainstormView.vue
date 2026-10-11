<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import type { ConversationMessage, Proposal, RecordedNote, SendMessageInput } from '@lfwa/core'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import Markdown from '../components/Markdown.vue'
import ProposalCard from '../components/ProposalCard.vue'
import RecordedNotes from '../components/RecordedNotes.vue'
import { ApiError, api, errorMessage } from '../lib/api'

const props = defineProps<{ profileId: string; id: string }>()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()

const idea = useQuery({
  queryKey: ['idea', () => props.profileId, () => props.id],
  queryFn: () => api.getIdea(props.profileId, props.id),
})

/** The reply being written right now by this person (kept apart from the saved thread until it finishes). */
const streaming = ref<{
  user?: ConversationMessage
  /** The reply as saved, once the stream says it is (null if nothing was kept). */
  reply?: ConversationMessage | null
  text: string
  proposals: Proposal[]
  notes: RecordedNote[]
} | null>(null)
// While someone else's reply is being written, look again every few seconds to see it arrive.
const conversation = useQuery({
  queryKey: ['conversation', () => props.profileId, () => props.id],
  queryFn: () => api.getConversation(props.profileId, props.id),
  refetchInterval: (query) => (query.state.data?.replyingNow && !streaming.value ? 3000 : false),
})

const messages = computed(() => {
  const saved = conversation.data.value?.messages ?? []
  const sent = streaming.value?.user
  return sent && !saved.some((m) => m.id === sent.id) ? [...saved, sent] : saved
})
/**
 * The streamed copy of the reply is shown until the saved one is in the thread, and not a moment
 * longer: re-reading the thread, the idea and its notes takes a while, and the saved reply can arrive
 * well before the rest. The same check keeps the person's own message from showing twice (above).
 */
const liveReplyShown = computed(() => {
  const live = streaming.value
  if (!live) return false
  return !(live.reply && savedMessages.value.some((m) => m.id === live.reply!.id))
})
const replyingNow = computed(() => (streaming.value ? null : conversation.data.value?.replyingNow))
const savedMessages = computed(() => conversation.data.value?.messages ?? [])
/** The last thing in the thread is a person's message nobody answered (the reply failed, or was cut off by a reload). */
const unanswered = computed(
  () => !streaming.value && !replyingNow.value && savedMessages.value.at(-1)?.role === 'user',
)
const empty = computed(
  () => !!conversation.data.value && messages.value.length === 0 && !streaming.value,
)

// ---- sending ----------------------------------------------------------------
interface ReplyProblem {
  message: string
  /** The fix is in account settings (no key, or a rejected one). */
  needsKey: boolean
}
const replyProblem = ref<ReplyProblem | null>(null)
const announcement = ref('')
const draft = ref('')
let controller: AbortController | undefined

/** `restore` is the text of a message to put back in the box if the reply could not even begin. */
async function send(body: SendMessageInput, restore?: string) {
  if (streaming.value) return
  replyProblem.value = null
  streaming.value = { text: '', proposals: [], notes: [] }
  announcement.value = 'The coach is replying…'
  controller = new AbortController()
  try {
    await api.streamReply(
      props.profileId,
      props.id,
      body,
      (event) => {
        const live = streaming.value
        if (!live) return
        if (event.type === 'message') live.user = event.message
        else if (event.type === 'text') live.text += event.text
        else if (event.type === 'note') live.notes.push(event.note)
        else if (event.type === 'proposal') live.proposals.push(event.proposal)
        else if (event.type === 'done') {
          live.reply = event.message
          announcement.value = 'The coach has replied.'
        } else if (event.type === 'error') {
          replyProblem.value = { message: event.message, needsKey: event.code === 'auth' }
          announcement.value = event.message
        }
      },
      controller.signal,
    )
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      announcement.value = 'You stopped the reply.'
    } else {
      if (restore && !draft.value) draft.value = restore
      replyProblem.value = {
        message: errorMessage(err),
        needsKey: err instanceof ApiError && err.status === 409 && /API key/i.test(err.message),
      }
      announcement.value = replyProblem.value.message
    }
  } finally {
    controller = undefined
    // The saved thread is the truth: fetch it, and only then drop the live copy, so nothing flickers.
    // Notes the AI recorded are now part of the idea, so the idea and its notes may have changed too.
    await Promise.all(
      ['conversation', 'idea', 'notes', 'ideas'].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    )
    streaming.value = null
  }
}

function submit() {
  const text = draft.value.trim()
  if (!text || streaming.value || replyingNow.value) return
  draft.value = ''
  void send({ text }, text)
}
const stop = () => controller?.abort()
onBeforeUnmount(() => controller?.abort())

// "Brainstorm" on the idea page arrives with ?start=1 when there is no conversation yet: begin it at once.
let autoStarted = false
watch(
  () => conversation.data.value,
  (data) => {
    if (autoStarted || !data || route.query.start !== '1') return
    autoStarted = true
    void router.replace({ query: {} })
    if (data.messages.length === 0) void send({ start: true })
  },
  { immediate: true },
)

// ---- starting again -----------------------------------------------------------
const confirmingRestart = ref(false)
const restart = useMutation({
  mutationFn: () => api.restartConversation(props.profileId, props.id),
  onSuccess: async () => {
    replyProblem.value = null
    await queryClient.invalidateQueries({ queryKey: ['conversation'] })
  },
  onSettled: () => (confirmingRestart.value = false),
})

// ---- keeping the latest message in view ---------------------------------------
const bottom = ref<HTMLElement>()
const nearBottom = () =>
  window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200
watch(
  () => [messages.value.length, streaming.value?.text.length],
  async () => {
    const follow = nearBottom() // measured before the new text makes the page longer
    await nextTick()
    if (follow) bottom.value?.scrollIntoView?.({ block: 'end' })
  },
)

const busyNote = computed(() =>
  replyingNow.value ? `${replyingNow.value.name} is waiting for a reply…` : '',
)
</script>

<template>
  <p v-if="idea.isPending.value">Loading…</p>
  <div v-else-if="idea.isError.value" role="alert" class="panel p-6">
    <h1 class="font-display text-lg">We couldn't open that idea</h1>
    <p class="mt-1 text-ink-soft">
      It may have been deleted, or the connection may have dropped. Try reloading the page.
    </p>
    <RouterLink
      :to="{ name: 'profile', params: { profileId } }"
      class="mt-3 inline-block underline"
    >
      Back to the profile
    </RouterLink>
  </div>

  <article v-else-if="idea.data.value" aria-labelledby="brainstorm-title" class="max-w-2xl">
    <p class="mb-2 text-sm">
      <RouterLink :to="{ name: 'idea', params: { profileId, id } }" class="underline">
        ← Back to the idea
      </RouterLink>
    </p>
    <h1 id="brainstorm-title" class="font-display text-2xl font-semibold">Brainstorm</h1>
    <p class="mb-2 font-display text-lg text-ink-soft">{{ idea.data.value.name }}</p>
    <p class="mb-4 text-sm text-ink-soft">
      Your AI (with your own key) will talk this idea through with you, and add the points you make
      to its notes as you go. Your idea, its notes and links, and this publication's details are
      sent to your AI provider so it can discuss them; the text of your drafts never is. Everyone in
      this profile sees this conversation. A new title or a separate idea is only a suggestion until
      someone accepts it.
    </p>

    <details class="mb-6 rounded-ctl border border-line bg-surface p-3 text-sm">
      <summary class="cursor-pointer font-medium">The idea being discussed</summary>
      <p class="mt-2 font-medium">{{ idea.data.value.name }}</p>
      <p v-if="idea.data.value.notes" class="mt-1 whitespace-pre-wrap">
        {{ idea.data.value.notes }}
      </p>
      <p v-else class="mt-1 text-ink-soft">No notes yet.</p>
      <ul v-if="idea.data.value.links.length" class="mt-2 list-disc pl-5">
        <li v-for="link in idea.data.value.links" :key="link.id" class="break-words">
          {{ link.title || link.url }}
        </li>
      </ul>
      <p class="mt-2">
        <RouterLink :to="{ name: 'idea', params: { profileId, id } }" class="underline">
          Open the idea to edit it
        </RouterLink>
      </p>
    </details>

    <p v-if="conversation.isPending.value">Loading the conversation…</p>
    <p v-else-if="conversation.isError.value" role="alert" class="text-danger">
      We couldn't load the conversation. Check your connection and reload the page.
    </p>

    <template v-else>
      <section
        v-if="empty"
        aria-labelledby="start-heading"
        class="mb-6 rounded-ctl border border-line bg-surface p-5"
      >
        <h2 id="start-heading" class="mb-1 font-display text-xl font-semibold">Talk it through</h2>
        <p class="mb-3 text-ink-soft">
          Your AI will open by asking the questions that matter most for this idea, and you answer.
          It adds the points you make to the idea's notes as you go, and can suggest a sharper title
          or a separate new idea, but only you decide on those.
        </p>
        <button type="button" class="btn btn-primary" @click="send({ start: true })">
          Start brainstorming
        </button>
      </section>

      <div v-else role="log" aria-label="Conversation" aria-relevant="additions" class="mb-4">
        <ol class="space-y-4">
          <li v-for="message in messages" :key="message.id">
            <p v-if="message.kind === 'kickoff'" class="text-center text-sm text-ink-soft">
              Brainstorm started{{ message.authorName ? ` by ${message.authorName}` : '' }}
            </p>
            <div
              v-else-if="message.role === 'user'"
              class="ml-8 rounded-ctl border border-line bg-surface p-3"
            >
              <p class="mb-1 text-sm font-medium text-ink-soft">
                {{ message.authorName ?? 'Someone' }}
              </p>
              <p class="whitespace-pre-wrap break-words">{{ message.text }}</p>
            </div>
            <div v-else class="mr-8 panel-sunken p-3">
              <p class="mb-1 text-sm font-medium text-ink-soft">
                Coach<span v-if="message.model" class="font-normal text-ink-soft">
                  · {{ message.model }}</span
                >
              </p>
              <Markdown v-if="message.text" :text="message.text" />
              <p v-if="message.stopReason === 'refusal'" class="text-sm text-ink-soft">
                The AI declined to answer that. Try putting it differently.
              </p>
              <p v-if="message.stopReason === 'max_tokens'" class="mt-2 text-sm text-ink-soft">
                This reply was cut short. Ask the coach to carry on.
              </p>
              <p v-if="message.status === 'stopped'" class="mt-2 text-sm text-ink-soft">
                The reply was stopped here.
              </p>
              <RecordedNotes :notes="message.notes" />
              <ProposalCard
                v-for="proposal in message.proposals"
                :key="proposal.id"
                :profile-id="profileId"
                :idea-id="id"
                :proposal="proposal"
                :idea="idea.data.value"
              />
            </div>
          </li>

          <li v-if="streaming && liveReplyShown" aria-live="off" class="mr-8 panel-sunken p-3">
            <p class="mb-1 text-sm font-medium text-ink-soft">Coach</p>
            <Markdown v-if="streaming.text" :text="streaming.text" />
            <p v-else class="text-ink-soft">Thinking…</p>
            <RecordedNotes :notes="streaming.notes" />
          </li>
        </ol>
      </div>

      <p ref="bottom" class="sr-only" aria-hidden="true"></p>
      <p class="sr-only" role="status">{{ announcement }}</p>

      <div
        v-if="replyProblem"
        role="alert"
        class="mb-4 rounded-ctl border border-danger bg-danger-wash p-3 text-danger"
      >
        <p>{{ replyProblem.message }}</p>
        <p v-if="replyProblem.needsKey" class="mt-1">
          <RouterLink to="/account" class="underline">Go to account settings</RouterLink>
        </p>
      </div>

      <div v-if="unanswered" class="mb-4 panel p-3">
        <p class="mb-2 text-ink-soft">Your coach hasn't replied to the last message.</p>
        <button type="button" class="btn btn-outline" @click="send({ retry: true })">
          Try again
        </button>
      </div>

      <p v-if="busyNote" role="status" class="mb-4 text-ink-soft">{{ busyNote }}</p>

      <form v-if="!empty" class="mb-6" @submit.prevent="submit">
        <label for="message" class="mb-1 block text-sm font-medium">Your message</label>
        <textarea
          id="message"
          v-model="draft"
          rows="4"
          :disabled="!!streaming || !!replyingNow"
          class="field mb-2"
          aria-describedby="message-hint"
          @keydown.enter.ctrl.exact.prevent="submit"
          @keydown.enter.meta.exact.prevent="submit"
        ></textarea>
        <p id="message-hint" class="mb-2 text-sm text-ink-soft">
          Press Ctrl+Enter (⌘+Enter on a Mac) to send.
        </p>
        <div class="flex items-center gap-3">
          <button
            v-if="!streaming"
            type="submit"
            class="btn btn-primary"
            :disabled="!draft.trim() || !!replyingNow"
          >
            Send
          </button>
          <button v-else type="button" class="btn btn-neutral" @click="stop">Stop</button>
        </div>
      </form>

      <div v-if="!empty && !streaming" class="border-t border-line pt-4">
        <button
          type="button"
          class="text-sm text-danger underline"
          @click="confirmingRestart = true"
        >
          Start again
        </button>
        <p v-if="restart.isError.value" role="alert" class="mt-2 text-danger">
          {{ errorMessage(restart.error.value) }}
        </p>
      </div>
    </template>

    <ConfirmDialog
      :open="confirmingRestart"
      title="Start the conversation again?"
      confirm-label="Yes, start again"
      busy-label="Clearing…"
      :busy="restart.isPending.value"
      @confirm="restart.mutate()"
      @cancel="confirmingRestart = false"
    >
      This deletes the whole conversation for everyone in this profile, including suggestions nobody
      has decided on. Changes you have already accepted stay.
    </ConfirmDialog>
  </article>
</template>
