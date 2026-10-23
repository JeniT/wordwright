<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import type { AdminAccount, AdminDecision } from '@wordwright/core'
import PageNav from '../components/PageNav.vue'
import QueryState from '../components/QueryState.vue'
import { api, errorMessage } from '../lib/api'
import { usePaging } from '../lib/paging'
import { queryKeys } from '../lib/queries'
import { useSessionStore } from '../stores/session'

/**
 * The owner's list of accounts (#328): name, address, date and status, and nothing a person has written. Those
 * waiting come first. A decision is emailed to the person and written to the audit log by the server.
 */
const session = useSessionStore()
const queryClient = useQueryClient()
const accounts = useQuery({
  queryKey: queryKeys.adminAccounts(),
  queryFn: () => api.adminAccounts(),
})

const decide = useMutation({
  mutationFn: (input: { id: string; decision: AdminDecision }) =>
    api.adminDecide(input.id, input.decision),
  onSuccess: (next) => queryClient.setQueryData(queryKeys.adminAccounts(), next),
})

const waiting = computed(() => accounts.data.value?.waiting ?? [])
const everyone = usePaging(() => accounts.data.value?.all ?? [], 'accounts')

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
const statusLabel = { waiting: 'Waiting', approved: 'Approved', declined: 'Declined' } as const
/** Admins, and you, are not decided about here: the server refuses it. */
const canDecide = (a: AdminAccount) => !a.isAdmin && a.id !== session.user?.id
</script>

<template>
  <div>
    <h1 class="h1 mb-6">Accounts</h1>
    <p v-if="decide.isError.value" role="alert" class="callout callout-danger mb-4 text-danger">
      {{ errorMessage(decide.error.value) }}
    </p>
    <QueryState :query="accounts" what="the accounts" detail>
      <section aria-labelledby="waiting-heading">
        <h2 id="waiting-heading" class="h2 mb-3">Waiting for approval</h2>
        <p v-if="!waiting.length" class="text-ink-soft">No one is waiting.</p>
        <ul v-else class="space-y-3" aria-label="Accounts waiting for approval">
          <li v-for="a in waiting" :key="a.id" class="card p-4">
            <p class="font-semibold break-words">{{ a.name }}</p>
            <p class="meta mt-1 break-words">
              {{ a.email }}
              <span v-if="!a.emailVerified" class="chip chip-quiet ml-1">Email not confirmed</span>
              · signed up {{ when(a.createdAt) }}
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :aria-label="`Approve ${a.name}`"
                :disabled="decide.isPending.value"
                @click="decide.mutate({ id: a.id, decision: 'approve' })"
              >
                Approve
              </button>
              <button
                type="button"
                class="btn btn-outline btn-sm"
                :aria-label="`Decline ${a.name}`"
                :disabled="decide.isPending.value"
                @click="decide.mutate({ id: a.id, decision: 'decline' })"
              >
                Decline
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section class="mt-10" aria-labelledby="everyone-heading">
        <h2 id="everyone-heading" class="h2 mb-3">Everyone</h2>
        <p v-if="!everyone.nav.value.total" class="text-ink-soft">No accounts yet.</p>
        <template v-else>
          <ul class="space-y-3" aria-label="All accounts">
            <li v-for="a in everyone.pageItems.value" :key="a.id" class="card p-4">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-semibold break-words">{{ a.name }}</p>
                  <p class="meta mt-1 break-words">
                    {{ a.email }} · signed up {{ when(a.createdAt) }}
                  </p>
                </div>
                <span class="chip chip-quiet">{{
                  a.isAdmin ? 'Admin' : statusLabel[a.approval]
                }}</span>
              </div>
              <div v-if="canDecide(a) && a.approval !== 'waiting'" class="mt-3">
                <button
                  type="button"
                  class="btn btn-outline btn-sm"
                  :aria-label="`${a.approval === 'approved' ? 'Decline' : 'Approve'} ${a.name}`"
                  :disabled="decide.isPending.value"
                  @click="
                    decide.mutate({
                      id: a.id,
                      decision: a.approval === 'approved' ? 'decline' : 'approve',
                    })
                  "
                >
                  {{ a.approval === 'approved' ? 'Decline' : 'Approve' }}
                </button>
              </div>
            </li>
          </ul>
          <PageNav
            v-if="everyone.pageCount.value > 1"
            class="mt-4"
            label="Accounts pages"
            v-bind="everyone.nav.value"
            announce
            @go="everyone.go"
          />
        </template>
      </section>
    </QueryState>
  </div>
</template>
