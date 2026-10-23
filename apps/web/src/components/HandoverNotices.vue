<script setup lang="ts">
import { useHandover, useHandoverActions } from '../lib/draft-people'

/**
 * What the draft's handover is waiting for, as notices at the top of the draft page: an offer to answer, a request
 * to answer (warn), and what the person has set going themselves, an offer or a request, with a way to take it back
 * (info). They show on the editor too, which holds back the notice bar's info notices: these are about this very draft.
 */
const props = defineProps<{ publicationId: string; draftId: string }>()
const { handover, isEditor, offeredToMe, myAsk } = useHandover(
  () => props.publicationId,
  () => props.draftId,
)
const actions = useHandoverActions(
  () => props.publicationId,
  () => props.draftId,
)
</script>

<template>
  <div v-if="handover.data.value" class="mb-4 flex flex-col gap-3 empty:hidden">
    <section
      v-if="offeredToMe"
      class="notice notice-warn"
      aria-label="Draft offered to you"
      data-testid="offered-to-me"
    >
      <p>
        <strong>{{ handover.data.value.editorName }}</strong> has offered you this draft. If you
        accept, you become its editor, the only person who can change its words.
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="actions.busy.value"
          @click="actions.accept.mutate()"
        >
          Accept
        </button>
        <button
          type="button"
          class="btn btn-outline btn-sm"
          :disabled="actions.busy.value"
          @click="actions.decline.mutate()"
        >
          Decline
        </button>
      </div>
    </section>

    <template v-if="isEditor">
      <section
        v-for="a in handover.data.value.asks"
        :key="a.id"
        class="notice notice-warn"
        :aria-label="`${a.byName} asked for this draft`"
      >
        <p>
          <strong>{{ a.byName }}</strong> asked for this draft.
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <button
            v-if="!handover.data.value.offer"
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="actions.busy.value"
            :aria-label="`Handover draft to ${a.byName}`"
            @click="actions.offer.mutate(a.byId)"
          >
            Handover draft
          </button>
          <button
            type="button"
            class="btn btn-quiet btn-sm"
            :disabled="actions.busy.value"
            :aria-label="`Not now: ${a.byName}`"
            @click="actions.closeAsk.mutate(a.id)"
          >
            Not now
          </button>
        </div>
      </section>
      <section v-if="handover.data.value.offer" class="notice notice-info" aria-label="Offer made">
        <p>
          You have offered this draft to <strong>{{ handover.data.value.offer.toName }}</strong
          >. You stay its editor until they accept.
        </p>
        <div class="mt-2">
          <button
            type="button"
            class="btn btn-outline btn-sm"
            :disabled="actions.busy.value"
            @click="actions.withdraw.mutate()"
          >
            Withdraw the offer
          </button>
        </div>
      </section>
    </template>

    <template v-else>
      <section
        v-if="handover.data.value.offer && !offeredToMe"
        class="notice notice-info"
        aria-label="Draft offered to someone"
      >
        <p>
          {{ handover.data.value.editorName }} has offered this draft to
          {{ handover.data.value.offer.toName }}.
        </p>
      </section>
      <section v-if="myAsk" class="notice notice-info" aria-label="Your request">
        <p>
          You have asked {{ handover.data.value.editorName }} for this draft. Nothing changes unless
          they offer it to you.
        </p>
        <div class="mt-2">
          <button
            type="button"
            class="btn btn-outline btn-sm"
            :disabled="actions.busy.value"
            @click="actions.closeAsk.mutate(myAsk.id)"
          >
            Withdraw my request
          </button>
        </div>
      </section>
    </template>

    <p v-if="actions.problem.value" role="alert" class="text-danger">{{ actions.problem.value }}</p>
  </div>
</template>
