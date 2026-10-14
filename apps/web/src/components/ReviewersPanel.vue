<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import type { ReviewState } from '@lfwa/core'
import { api, errorMessage } from '../lib/api'
import { queryKeys } from '../lib/queries'
import { useProfile } from '../lib/useProfiles'
import { useSessionStore } from '../stores/session'
import QueryState from './QueryState.vue'
import TextField from './TextField.vue'

/**
 * Asking people outside the profile to read this draft and comment on it. They get an emailed link and an account that
 * reaches only this draft; nothing else of the profile is shown to them. The editor and owners invite and can end a
 * review at any time. Others in the profile don't see this at all.
 */
const props = defineProps<{ profileId: string; draftId: string; editorId: string }>()
const queryClient = useQueryClient()
const session = useSessionStore()
const { profile } = useProfile(() => props.profileId)
const mayManage = computed(
  () => session.user?.id === props.editorId || profile.value?.role === 'owner',
)

const list = useQuery({
  queryKey: computed(() => queryKeys.reviewers(props.profileId, props.draftId)),
  queryFn: () => api.listReviewers(props.profileId, props.draftId),
  enabled: mayManage,
})
const refresh = () =>
  queryClient.invalidateQueries({ queryKey: queryKeys.reviewers(props.profileId, props.draftId) })

const email = ref('')
const sentTo = ref('')
const invite = useMutation({
  mutationFn: () => api.inviteReviewer(props.profileId, props.draftId, email.value),
  onSuccess: async () => {
    sentTo.value = email.value
    email.value = ''
    await refresh()
  },
})
const revoke = useMutation({
  mutationFn: (id: string) => api.revokeReviewer(props.profileId, props.draftId, id),
  onSuccess: refresh,
})
const withdraw = useMutation({
  mutationFn: (id: string) => api.withdrawReviewInvitation(props.profileId, props.draftId, id),
  onSuccess: refresh,
})
const problem = computed(() => {
  const failed = [invite, revoke, withdraw].find((m) => m.isError.value)
  return failed ? errorMessage(failed.error.value) : ''
})
const stateLabel: Record<ReviewState, string> = {
  open: 'Reading',
  left: 'Stopped reviewing',
  revoked: 'Access ended',
}
</script>

<template>
  <details v-if="mayManage" class="mb-6 text-sm">
    <summary class="cursor-pointer text-ink-soft">
      Ask someone to review this draft<template v-if="list.data.value?.reviewers.length">
        ({{ list.data.value.reviewers.length }})</template
      >
    </summary>
    <div class="mt-3">
      <p class="mb-3 text-ink-soft">
        They are emailed a link and can read this one draft and write comments on it, and nothing
        else of the profile. Only you see their comments.
      </p>
      <form class="flex flex-wrap items-end gap-3" @submit.prevent="invite.mutate()">
        <div class="min-w-60 flex-1">
          <TextField
            v-model="email"
            label="Their email address"
            type="email"
            autocomplete="off"
            required
          />
        </div>
        <button type="submit" class="mb-4 btn btn-outline" :disabled="invite.isPending.value">
          Send the invitation
        </button>
      </form>
      <p v-if="sentTo" role="status" class="mb-3">
        If {{ sentTo }} can be invited, they've been emailed a link.
      </p>
      <p v-if="problem" role="alert" class="mb-3 text-danger">{{ problem }}</p>

      <QueryState :query="list" what="who is reviewing">
        <ul v-if="list.data.value?.reviewers.length" class="mb-3 space-y-2" aria-label="Reviewers">
          <li
            v-for="r in list.data.value.reviewers"
            :key="r.id"
            class="flex flex-wrap items-center gap-x-3 gap-y-1"
          >
            <span>
              <strong>{{ r.name }}</strong> ({{ r.email }}) · {{ stateLabel[r.state] }}
            </span>
            <button
              v-if="r.state === 'open'"
              type="button"
              class="btn btn-sm btn-neutral"
              :disabled="revoke.isPending.value"
              :aria-label="`End ${r.name}'s review`"
              @click="revoke.mutate(r.id)"
            >
              End their review
            </button>
          </li>
        </ul>
        <ul
          v-if="list.data.value?.pending.length"
          class="space-y-2"
          aria-label="Invitations waiting"
        >
          <li
            v-for="p in list.data.value.pending"
            :key="p.id"
            class="flex flex-wrap items-center gap-x-3 gap-y-1"
          >
            <span>{{ p.email }} · waiting for a reply</span>
            <button
              type="button"
              class="btn btn-sm btn-neutral"
              :disabled="withdraw.isPending.value"
              :aria-label="`Withdraw the invitation to ${p.email}`"
              @click="withdraw.mutate(p.id)"
            >
              Withdraw
            </button>
          </li>
        </ul>
      </QueryState>
    </div>
  </details>
</template>
