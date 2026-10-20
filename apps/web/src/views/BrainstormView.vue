<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  MAX_CONVERSATIONS_PER_IDEA,
  type ConversationMessage,
  type Proposal,
  type RecordedNote,
  type SendMessageInput,
} from '@wordwright/core'
import AiButton from '../components/AiButton.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import Explain from '../components/Explain.vue'
import Markdown from '../components/Markdown.vue'
import NextStep from '../components/NextStep.vue'
import PageNav from '../components/PageNav.vue'
import SharedThreadNotice from '../components/SharedThreadNotice.vue'
import ProposalCard from '../components/ProposalCard.vue'
import RecordedNotes from '../components/RecordedNotes.vue'
import StepHeading from '../components/StepHeading.vue'
import { ApiError, api, errorMessage } from '../lib/api'
import { useInlineEdit } from '../lib/inline-edit'
import { vTip } from '../lib/tip'
import Icon from '../components/Icon.vue'
import { takeHeldMessage } from '../lib/pending-message'
import { invalidateRoots, queryKeys, useIdea } from '../lib/queries'
import ReplyProblemAlert from '../components/ReplyProblemAlert.vue'
import QueryState from '../components/QueryState.vue'
import SaveStatus from '../components/SaveStatus.vue'
import IdeaGate from '../components/IdeaGate.vue'

const props = defineProps<{ publicationId: string; id: string }>()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()

const idea = useIdea(
  () => props.publicationId,
  () => props.id,
)

/** The reply being written right now by this person (kept apart from the saved thread until it finishes). */
const streaming = ref<{
  /** Which conversation the reply is for: paging to another one doesn't show it there. */
  conversationId: string
  user?: ConversationMessage
  /** The reply as saved, once the stream says it is (null if nothing was kept). */
  reply?: ConversationMessage | null
  text: string
  proposals: Proposal[]
  notes: RecordedNote[]
} | null>(null)
// The idea's conversations, oldest first like the research runs: the newest is shown until the writer pages back.
const list = useQuery({
  queryKey: computed(() => queryKeys.conversations(props.publicationId, props.id)),
  queryFn: () => api.getConversations(props.publicationId, props.id),
})
const ordered = computed(() => list.data.value?.conversations ?? [])
const chosen = ref<string | null>(null)
const position = computed(() => {
  const at = ordered.value.findIndex((c) => c.id === chosen.value)
  return at === -1 ? ordered.value.length - 1 : at
})
const current = computed(() => ordered.value[position.value])
const currentId = computed(() => current.value?.id)
const atLimit = computed(() => ordered.value.length >= MAX_CONVERSATIONS_PER_IDEA)
const heading = ref<HTMLElement | null>(null)
function go(step: -1 | 1) {
  chosen.value = ordered.value[position.value + step]?.id ?? null
}
/** From the bottom of a long conversation the other one starts a long way up, so go back to the top of it. */
function goFromBottom(step: -1 | 1) {
  go(step)
  heading.value?.scrollIntoView?.({ block: 'start' })
  heading.value?.focus({ preventScroll: true }) // keyboard users continue from the top too
}
const nav = computed(() => ({
  page: position.value + 1,
  pageCount: ordered.value.length,
  first: position.value + 1,
  last: position.value + 1,
  total: ordered.value.length,
  noun: 'conversation',
  size: 1,
  single: true,
  previousLabel: 'Earlier conversation',
  nextLabel: 'Later conversation',
}))
/** When it began and who began it: a conversation's label when it has no title, and its second line when it has. */
const startedOn = computed(() =>
  current.value
    ? [
        new Date(current.value.createdAt).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        current.value.startedByName,
      ]
        .filter(Boolean)
        .join(' · ')
    : '',
)

// While someone else's reply is being written, look again every few seconds to see it arrive.
const conversation = useQuery({
  queryKey: computed(() =>
    queryKeys.conversation(props.publicationId, props.id, currentId.value ?? ''),
  ),
  queryFn: () => api.getConversation(props.publicationId, props.id, currentId.value!),
  enabled: computed(() => !!currentId.value),
  refetchInterval: (query) => (query.state.data?.replyingNow && !streaming.value ? 3000 : false),
})
/** The reply being written by this person, if it is for the conversation on screen. */
const liveHere = computed(() =>
  streaming.value && streaming.value.conversationId === currentId.value ? streaming.value : null,
)

const messages = computed(() => {
  const saved = conversation.data.value?.messages ?? []
  const sent = liveHere.value?.user
  return sent && !saved.some((m) => m.id === sent.id) ? [...saved, sent] : saved
})
/** What the thread shows: the opening turn is the app's own, so it is kept but not listed. */
const shown = computed(() => messages.value.filter((m) => m.kind !== 'kickoff'))
/**
 * The streamed copy of the reply is shown until the saved one is in the thread, and not a moment
 * longer: re-reading the thread, the idea and its notes takes a while, and the saved reply can arrive
 * well before the rest. The same check keeps the person's own message from showing twice (above).
 */
const liveReplyShown = computed(() => {
  const live = liveHere.value
  if (!live) return false
  return !(live.reply && savedMessages.value.some((m) => m.id === live.reply!.id))
})
const replyingNow = computed(() => (streaming.value ? null : conversation.data.value?.replyingNow))
const savedMessages = computed(() => conversation.data.value?.messages ?? [])
/** The last thing in the thread is a person's message nobody answered (the reply failed, or was cut off by a reload). */
const unanswered = computed(
  () => !streaming.value && !replyingNow.value && savedMessages.value.at(-1)?.role === 'user',
)
/** There is a conversation on screen, and nothing has been said in it yet. */
const empty = computed(
  () => !!conversation.data.value && messages.value.length === 0 && !streaming.value,
)
/** No conversation exists yet: the invitation to begin the first. */
const none = computed(() => !!list.data.value && ordered.value.length === 0 && !streaming.value)

// ---- sending ----------------------------------------------------------------
interface ReplyProblem {
  message: string
  /** `missing-key`: none saved yet. `rejected-key`: the provider refused it. Either way the fix is in account settings. */
  keyProblem: 'missing-key' | 'rejected-key' | null
}
const replyProblem = ref<ReplyProblem | null>(null)
const announcement = ref('')
const draft = ref('')
let controller: AbortController | undefined

function problemFrom(err: unknown): ReplyProblem {
  return {
    message: errorMessage(err),
    keyProblem:
      err instanceof ApiError && err.status === 409 && /API key/i.test(err.message)
        ? 'missing-key'
        : null,
  }
}

/**
 * `restore` is the text of a message to put back in the box if the reply could not even begin. `conversationId`
 * is the conversation on screen unless a new one has just been made.
 */
async function send(body: SendMessageInput, restore?: string, conversationId = currentId.value) {
  if (streaming.value || !conversationId) return
  replyProblem.value = null
  streaming.value = { conversationId, text: '', proposals: [], notes: [] }
  announcement.value = ''
  controller = new AbortController()
  try {
    await api.streamReply(
      props.publicationId,
      props.id,
      conversationId,
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
          announcement.value = 'Your AI has replied.'
        } else if (event.type === 'error') {
          replyProblem.value = {
            message: event.message,
            keyProblem: event.code === 'auth' ? 'rejected-key' : null,
          }
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
      replyProblem.value = problemFrom(err)
      announcement.value = replyProblem.value.message
    }
  } finally {
    controller = undefined
    // The saved thread is the truth: fetch it, and only then drop the live copy, so nothing flickers.
    // Notes the AI recorded are now part of the idea, so the idea and its notes may have changed too.
    await invalidateRoots(queryClient, 'conversation', 'idea', 'notes', 'ideas')
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

/**
 * Begins a conversation, with the AI speaking first: in the empty one on screen, or in a new one, which is then
 * shown. Starting costs the person's tokens, so it only ever happens from a button (or `?start=1` from one).
 */
const creating = ref(false)
async function startNew() {
  if (streaming.value || creating.value) return
  replyProblem.value = null
  creating.value = true
  try {
    const target =
      empty.value && currentId.value
        ? { id: currentId.value }
        : await api.createConversation(props.publicationId, props.id)
    chosen.value = target.id
    await invalidateRoots(queryClient, 'conversation')
    void send({ start: true }, undefined, target.id)
  } catch (err) {
    replyProblem.value = problemFrom(err)
    announcement.value = replyProblem.value.message
  } finally {
    creating.value = false
  }
}

// "Refine with your AI" on the idea page arrives with ?start=1 when there is no conversation yet: begin it at once.
let autoStarted = false
watch(
  () => [list.data.value, conversation.data.value] as const,
  ([conversations, data]) => {
    if (autoStarted || !conversations || route.query.start !== '1') return
    if (conversations.conversations.length > 0 && !data) return // wait for the newest to load
    autoStarted = true
    void router.replace({ query: {} })
    if (!data || data.messages.length === 0) void startNew()
  },
  { immediate: true },
)

// A message typed on the idea's landing page is sent once the thread is here to add it to.
let heldSent = false
watch(
  () => conversation.data.value,
  (data) => {
    if (heldSent || !data) return
    heldSent = true
    const text = takeHeldMessage(props.publicationId, props.id)
    if (text && data.messages.length) void send({ text }, text)
  },
  { immediate: true },
)

// ---- renaming it ------------------------------------------------------------
const titleDraft = ref('')
const titleField = ref<HTMLInputElement>()
const renameButton = ref<HTMLButtonElement>()
const titleEdit = useInlineEdit<'title'>({
  field: () => titleField.value,
  trigger: () => renameButton.value,
})
function startRenaming() {
  titleDraft.value = current.value?.title ?? ''
  void titleEdit.start('title')
}
const rename = useMutation({
  mutationFn: (title: string) =>
    api.renameConversation(props.publicationId, props.id, currentId.value!, title),
  onSuccess: async () => {
    await invalidateRoots(queryClient, 'conversation')
    void titleEdit.stop()
  },
})
function saveTitle() {
  const title = titleDraft.value.trim()
  if (!title) return
  if (title === current.value?.title) return void titleEdit.stop()
  rename.mutate(title)
}
function cancelRenaming() {
  rename.reset()
  void titleEdit.stop()
}

// ---- deleting one ---------------------------------------------------------------
const confirmingDelete = ref(false)
const remove = useMutation({
  mutationFn: () => api.deleteConversation(props.publicationId, props.id, currentId.value!),
  onSuccess: async () => {
    replyProblem.value = null
    chosen.value = null // the newest that is left
    await invalidateRoots(queryClient, 'conversation')
  },
  onSettled: () => (confirmingDelete.value = false),
})

// ---- keeping the latest message in view ---------------------------------------
const bottom = ref<HTMLElement>()
const nearBottom = () =>
  window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200
watch(
  () => [messages.value.length, liveHere.value?.text.length],
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
  <IdeaGate :id="id" :publication-id="publicationId">
    <article v-if="idea.data.value" class="max-w-2xl">
      <StepHeading>Refine</StepHeading>
      <Explain tutorial-only class="-mt-3 mb-6">
        Your AI asks questions about this idea and adds the points you make to its notes.
      </Explain>
      <SharedThreadNotice :publication-id="publicationId" />

      <!-- Another conversation, kept above the thread so it is found without scrolling past a long one. -->
      <div v-if="current && !empty" class="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <AiButton
          class="btn btn-outline"
          :busy="creating"
          busy-text="Starting a conversation…"
          :disabled="atLimit || !!streaming"
          @click="startNew"
        >
          New conversation
        </AiButton>
        <p v-if="atLimit" class="min-w-0 flex-1 basis-64 text-sm text-ink-soft">
          This idea has {{ MAX_CONVERSATIONS_PER_IDEA }} conversations, the most it can hold. Delete
          one to start another.
        </p>
        <p v-else class="min-w-0 flex-1 basis-64 text-sm text-ink-soft">
          This will send this publication’s description and this idea’s title and notes and reading
          list to your AI. It will not send your drafts.
        </p>
      </div>

      <QueryState :query="list" what="the conversations" loading="Loading the conversation…">
        <template v-if="current">
          <PageNav
            v-if="ordered.length > 1"
            v-bind="nav"
            label="Conversations, above the thread"
            announce
            class="mb-2"
            @go="go"
          />
          <div class="mb-4">
            <div class="mb-1 flex items-start gap-2">
              <h2
                ref="heading"
                tabindex="-1"
                class="min-w-0 flex-1 break-words font-display text-lg font-semibold focus:outline-none"
              >
                <form
                  v-if="titleEdit.editing.value"
                  class="flex flex-wrap items-center gap-2"
                  @submit.prevent="saveTitle"
                  @keydown.escape="cancelRenaming"
                >
                  <input
                    ref="titleField"
                    v-model="titleDraft"
                    type="text"
                    maxlength="60"
                    class="field min-w-0 flex-1 basis-48"
                    aria-label="Conversation title"
                  />
                  <button
                    type="submit"
                    class="btn btn-sm btn-primary"
                    :disabled="!titleDraft.trim() || rename.isPending.value"
                  >
                    Save
                  </button>
                  <button type="button" class="btn btn-sm btn-neutral" @click="cancelRenaming">
                    Cancel
                  </button>
                </form>
                <!-- The highlighter marks a title the AI gave, until a person has changed it. -->
                <span v-else-if="current.title" :class="{ 'bg-mark': current.titleByAi }">{{
                  current.title
                }}</span>
                <template v-else>{{ startedOn }}</template>
              </h2>
              <template v-if="!titleEdit.editing.value">
                <button
                  ref="renameButton"
                  v-tip="'Rename conversation'"
                  type="button"
                  class="btn btn-sm btn-icon btn-ghost shrink-0"
                  aria-label="Rename conversation"
                  @click="startRenaming"
                >
                  <Icon name="edit" />
                </button>
                <button
                  v-tip="'Delete conversation'"
                  type="button"
                  class="btn btn-sm btn-icon btn-ghost btn-ghost-danger shrink-0"
                  aria-label="Delete conversation"
                  :disabled="!!streaming"
                  @click="confirmingDelete = true"
                >
                  <Icon name="remove" />
                </button>
              </template>
            </div>
            <p v-if="current.title" class="mb-1 text-sm text-ink-soft">{{ startedOn }}</p>
            <SaveStatus :mutation="rename" saved="" class="mb-2" />
            <p v-if="remove.isError.value" role="alert" class="mb-2 text-danger">
              {{ errorMessage(remove.error.value) }}
            </p>
          </div>
        </template>
        <div v-if="none || empty" class="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <AiButton
            class="btn btn-primary"
            :busy="!!streaming"
            busy-text="Your AI is replying…"
            :disabled="creating"
            @click="startNew"
          >
            Refine with your AI
          </AiButton>
          <p class="min-w-0 flex-1 basis-64 text-sm text-ink-soft">
            This will send this publication’s description and this idea’s title and notes and
            reading list to your AI. It will not send your drafts.
          </p>
        </div>
        <ReplyProblemAlert
          v-if="(none || empty) && replyProblem"
          :message="replyProblem.message"
          :key-problem="replyProblem.keyProblem"
        />

        <QueryState
          v-else-if="current"
          :query="conversation"
          what="the conversation"
          loading="Loading the conversation…"
        >
          <div role="log" aria-label="Conversation" aria-relevant="additions" class="mb-4">
            <ol class="space-y-4">
              <li v-for="message in shown" :key="message.id">
                <div
                  v-if="message.role === 'user'"
                  class="ml-8 rounded-ctl border border-line bg-surface p-3"
                >
                  <p class="mb-1 text-sm font-medium text-ink-soft">
                    {{ message.authorName ?? 'Someone' }}
                  </p>
                  <p class="whitespace-pre-wrap break-words">{{ message.text }}</p>
                </div>
                <div v-else class="mr-8 panel-sunken p-3">
                  <p class="mb-1 text-sm font-medium text-ink-soft">Your AI</p>
                  <Markdown v-if="message.text" :text="message.text" />
                  <p v-if="message.stopReason === 'refusal'" class="text-sm text-ink-soft">
                    Your AI declined to answer that. Try putting it differently.
                  </p>
                  <p v-if="message.stopReason === 'max_tokens'" class="mt-2 text-sm text-ink-soft">
                    This reply was cut short. Ask your AI to carry on.
                  </p>
                  <p v-if="message.status === 'stopped'" class="mt-2 text-sm text-ink-soft">
                    The reply was stopped here.
                  </p>
                  <RecordedNotes :notes="message.notes" />
                  <ProposalCard
                    v-for="proposal in message.proposals"
                    :key="proposal.id"
                    :publication-id="publicationId"
                    :idea-id="id"
                    :conversation-id="current!.id"
                    :proposal="proposal"
                    :idea="idea.data.value"
                  />
                </div>
              </li>

              <li v-if="liveHere && liveReplyShown" aria-live="off" class="mr-8 panel-sunken p-3">
                <p class="mb-1 text-sm font-medium text-ink-soft">Your AI</p>
                <Markdown v-if="liveHere.text" :text="liveHere.text" />
                <p v-else class="text-ink-soft">Thinking…</p>
                <RecordedNotes :notes="liveHere.notes" />
              </li>
            </ol>
          </div>

          <p ref="bottom" class="sr-only" aria-hidden="true"></p>
          <p class="sr-only" role="status">{{ announcement }}</p>

          <ReplyProblemAlert
            v-if="replyProblem"
            :message="replyProblem.message"
            :key-problem="replyProblem.keyProblem"
          />

          <div v-if="unanswered" class="mb-4 panel p-3">
            <p class="mb-2 text-ink-soft">Your AI didn’t reply to your last message.</p>
            <AiButton
              class="btn btn-outline"
              :busy="!!streaming"
              busy-text="Your AI is replying…"
              @click="send({ retry: true })"
            >
              Try again
            </AiButton>
          </div>

          <p v-if="busyNote" role="status" class="mb-4 text-ink-soft">{{ busyNote }}</p>

          <form class="mb-6" @submit.prevent="submit">
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
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <AiButton
                type="submit"
                class="btn btn-primary"
                :busy="!!streaming"
                busy-text="Your AI is replying…"
                :disabled="!draft.trim() || !!replyingNow"
              >
                Send
              </AiButton>
              <button v-if="streaming" type="button" class="btn btn-neutral" @click="stop">
                Stop
              </button>
              <p class="min-w-0 flex-1 basis-64 text-sm text-ink-soft">
                This will re-send up-to-date information about the idea’s title, notes and reading
                list to your AI. It will not send your drafts.
              </p>
            </div>
          </form>

          <PageNav
            v-if="ordered.length > 1"
            v-bind="nav"
            label="Conversations, below the thread"
            class="mt-4"
            @go="goFromBottom"
          />
        </QueryState>
      </QueryState>

      <ConfirmDialog
        :open="confirmingDelete"
        title="Delete the conversation?"
        confirm-label="Delete conversation"
        busy-label="Deleting…"
        :busy="remove.isPending.value"
        @confirm="remove.mutate()"
        @cancel="confirmingDelete = false"
      >
        This deletes this conversation for everyone in this publication, including suggestions
        nobody has decided on. Changes you have already accepted stay. Your other conversations stay
        too.
      </ConfirmDialog>

      <NextStep
        :to="{ name: 'idea-drafts', params: { publicationId, id } }"
        label="Next: 05 Draft"
      />
    </article>
  </IdeaGate>
</template>
