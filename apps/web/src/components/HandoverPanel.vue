<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import type { HandoverEvent, HandoverState } from '@wordwright/core'
import { api, errorMessage } from '../lib/api'
import { invalidateRoots, queryKeys } from '../lib/queries'
import { usePublication } from '../lib/usePublications'
import { useSessionStore } from '../stores/session'
import QueryState from './QueryState.vue'

/**
 * Who has the pen on this draft, and how it moves (CONTEXT.md, "Handover"). The editor offers the draft to a named
 * member, who accepts; until then nothing changes. Any other member can ask, which only prompts the editor. An owner
 * can reassign it when the editor is away. All of it happens here, on the draft page.
 */
const props = defineProps<{ publicationId: string; draftId: string }>()
const queryClient = useQueryClient()
const session = useSessionStore()
const { publication } = usePublication(() => props.publicationId)

const handover = useQuery({
  queryKey: computed(() => queryKeys.handover(props.publicationId, props.draftId)),
  queryFn: () => api.getHandover(props.publicationId, props.draftId),
})
const me = computed(() => session.user?.id)
const isEditor = computed(() => handover.data.value?.editorId === me.value)
const isOwner = computed(() => publication.value?.role === 'owner')
const others = computed(() =>
  (publication.value?.members ?? []).filter((m) => m.userId !== handover.data.value?.editorId),
)
const offeredToMe = computed(() => handover.data.value?.offer?.toId === me.value)
const myAsk = computed(() => handover.data.value?.asks.find((a) => a.byId === me.value))

const target = ref('')
const reassignTarget = ref('')

/** Every action answers with the handover as it now is; a change of editor also changes what the page may do. */
function settle(state: HandoverState) {
  queryClient.setQueryData(queryKeys.handover(props.publicationId, props.draftId), state)
  void invalidateRoots(queryClient, 'draft', 'critique', 'attention')
}
const run = <A,>(fn: (arg: A) => Promise<HandoverState>) =>
  useMutation({ mutationFn: fn, onSuccess: settle })
const offer = run((userId: string) => api.offerDraft(props.publicationId, props.draftId, userId))
const withdraw = run(() => api.withdrawOffer(props.publicationId, props.draftId))
const accept = run(() => api.acceptOffer(props.publicationId, props.draftId))
const decline = run(() => api.declineOffer(props.publicationId, props.draftId))
const ask = run(() => api.askForDraft(props.publicationId, props.draftId))
const closeAsk = run((askId: string) => api.closeAsk(props.publicationId, props.draftId, askId))
const reassign = run((userId: string) =>
  api.reassignDraft(props.publicationId, props.draftId, userId),
)
const all = [offer, withdraw, accept, decline, ask, closeAsk, reassign]
const problem = computed(() => {
  const failed = all.find((m) => m.isError.value)
  return failed ? errorMessage(failed.error.value) : ''
})
const busy = computed(() => all.some((m) => m.isPending.value))

const person = (name: string | null) => name ?? 'a former member'
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
const outcome: Record<string, string> = {
  pending: 'waiting for a reply',
  accepted: 'accepted',
  declined: 'declined',
  withdrawn: 'withdrawn',
  dismissed: 'set aside',
  fulfilled: 'answered',
}
function describe(e: HandoverEvent): string {
  const actor = person(e.actorName)
  const member = person(e.memberName)
  if (e.kind === 'reassign') {
    return e.automatic
      ? `Passed to ${member} when the previous editor left`
      : `Reassigned by ${actor} to ${member}`
  }
  const said =
    e.kind === 'offer' ? `${actor} offered the draft to ${member}` : `${actor} asked for the draft`
  return `${said}: ${outcome[e.status]}`
}
</script>

<template>
  <section aria-labelledby="handover-heading" class="mb-6 text-sm">
    <h2 id="handover-heading" class="sr-only">Who edits this draft</h2>
    <QueryState :query="handover" what="who edits this draft" loading="Loading…">
      <template v-if="handover.data.value">
        <div v-if="offeredToMe" class="callout mb-3" data-testid="offered-to-me">
          <p class="mb-2">
            <strong>{{ handover.data.value.editorName }}</strong> has offered you this draft. If you
            accept, you become its editor, the one person who changes its words. Until then it stays
            with them.
          </p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn btn-primary" :disabled="busy" @click="accept.mutate()">
              Accept
            </button>
            <button
              type="button"
              class="btn btn-outline"
              :disabled="busy"
              @click="decline.mutate()"
            >
              Decline
            </button>
          </div>
        </div>

        <template v-if="isEditor">
          <ul v-if="handover.data.value.asks.length" class="mb-3 space-y-2" aria-label="Requests">
            <li
              v-for="a in handover.data.value.asks"
              :key="a.id"
              class="callout flex flex-wrap items-center gap-x-3 gap-y-2"
            >
              <span>
                <strong>{{ a.byName }}</strong> asked for this draft.
              </span>
              <button
                v-if="!handover.data.value.offer"
                type="button"
                class="btn btn-sm btn-outline"
                :disabled="busy"
                @click="offer.mutate(a.byId)"
              >
                Offer it to {{ a.byName }}
              </button>
              <button
                type="button"
                class="btn btn-sm btn-neutral"
                :disabled="busy"
                @click="closeAsk.mutate(a.id)"
              >
                Not now
              </button>
            </li>
          </ul>
          <div v-if="handover.data.value.offer" class="mb-3 flex flex-wrap items-center gap-3">
            <p>
              You have offered this draft to <strong>{{ handover.data.value.offer.toName }}</strong
              >. You stay its editor until they accept.
            </p>
            <button
              type="button"
              class="btn btn-sm btn-neutral"
              :disabled="busy"
              @click="withdraw.mutate()"
            >
              Withdraw the offer
            </button>
          </div>
          <details v-else class="mb-3">
            <summary class="cursor-pointer text-ink-soft">Hand this draft to someone</summary>
            <form
              v-if="others.length"
              class="mt-2 flex flex-wrap items-end gap-3"
              @submit.prevent="target && offer.mutate(target)"
            >
              <div>
                <label for="handover-to" class="mb-1 block font-medium">Offer it to</label>
                <select id="handover-to" v-model="target" class="field">
                  <option value="" disabled>Choose a member</option>
                  <option v-for="m in others" :key="m.userId" :value="m.userId">
                    {{ m.name }}
                  </option>
                </select>
              </div>
              <button type="submit" class="btn btn-outline" :disabled="busy || !target">
                Offer the draft
              </button>
              <p class="basis-full text-ink-soft">
                They are emailed, and choose whether to accept. You stay the editor until they do.
              </p>
            </form>
            <p v-else class="mt-2 text-ink-soft">
              There is nobody else in this publication yet. Invite someone from the publication's
              settings.
            </p>
          </details>
        </template>

        <template v-else>
          <p v-if="handover.data.value.offer && !offeredToMe" class="mb-3 text-ink-soft">
            {{ handover.data.value.editorName }} has offered this draft to
            {{ handover.data.value.offer.toName }}.
          </p>
          <div v-if="myAsk" class="mb-3 flex flex-wrap items-center gap-3">
            <p>
              You have asked {{ handover.data.value.editorName }} for this draft. Nothing changes
              unless they offer it to you.
            </p>
            <button
              type="button"
              class="btn btn-sm btn-neutral"
              :disabled="busy"
              @click="closeAsk.mutate(myAsk.id)"
            >
              Take back my request
            </button>
          </div>
          <p v-else-if="!offeredToMe" class="mb-3">
            <button
              type="button"
              class="btn btn-sm btn-outline"
              :disabled="busy"
              @click="ask.mutate()"
            >
              Ask {{ handover.data.value.editorName }} for this draft
            </button>
          </p>
        </template>

        <details v-if="isOwner && !isEditor && others.length" class="mb-3">
          <summary class="cursor-pointer text-ink-soft">Reassign this draft (owners)</summary>
          <form
            class="mt-2 flex flex-wrap items-end gap-3"
            @submit.prevent="reassignTarget && reassign.mutate(reassignTarget)"
          >
            <div>
              <label for="handover-reassign" class="mb-1 block font-medium"
                >Make this person the editor</label
              >
              <select id="handover-reassign" v-model="reassignTarget" class="field">
                <option value="" disabled>Choose a member</option>
                <option v-for="m in others" :key="m.userId" :value="m.userId">{{ m.name }}</option>
              </select>
            </div>
            <button type="submit" class="btn btn-outline" :disabled="busy || !reassignTarget">
              Reassign the draft
            </button>
            <p class="basis-full text-ink-soft">
              For when the editor is away. It takes effect at once, and the history records that you
              did it.
            </p>
          </form>
        </details>

        <p v-if="problem" role="alert" class="mb-3 text-danger">{{ problem }}</p>

        <details v-if="handover.data.value.history.length" class="mb-3">
          <summary class="cursor-pointer text-ink-soft">
            Who has edited this draft ({{ handover.data.value.history.length }})
          </summary>
          <ul class="mt-2 space-y-1 text-ink-soft">
            <li v-for="e in handover.data.value.history" :key="e.id">
              {{ describe(e) }}, {{ when(e.createdAt) }}
            </li>
          </ul>
        </details>
      </template>
    </QueryState>
  </section>
</template>
