<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { api, errorMessage } from '../lib/api'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const queryClient = useQueryClient()
const key = ['invitation-blocks']

// Managing blocks needs a confirmed address, so an unconfirmed account can't lift someone else's.
const blocks = useQuery({
  queryKey: key,
  queryFn: () => api.getInvitationBlocks(),
  enabled: !!session.user?.emailVerified,
  retry: false,
})
const refresh = () => queryClient.invalidateQueries({ queryKey: key })
const setAll = useMutation({
  mutationFn: (blocked: boolean) => api.setBlockAllInvitations(blocked),
  onSuccess: refresh,
})
const unblock = useMutation({
  mutationFn: (senderId: string) => api.unblockInviter(senderId),
  onSuccess: refresh,
})
</script>

<template>
  <section v-if="session.user" aria-labelledby="invite-blocks-heading">
    <h2 id="invite-blocks-heading" class="mb-3 font-display text-xl font-semibold">
      Who can invite you
    </h2>

    <p v-if="!session.user.emailVerified" class="text-sm text-ink-soft">
      Confirm your email address to choose who can invite you to share a profile.
    </p>
    <p v-else-if="blocks.isPending.value">Loading…</p>
    <p v-else-if="blocks.isError.value" role="alert" class="text-danger">
      {{ errorMessage(blocks.error.value) }}
    </p>

    <template v-else-if="blocks.data.value">
      <label class="mb-4 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          class="mt-1"
          :checked="blocks.data.value.all"
          :disabled="setAll.isPending.value"
          @change="setAll.mutate(($event.target as HTMLInputElement).checked)"
        />
        <span>
          Don't accept invitations from anyone
          <span class="block text-ink-soft"
            >Invitations to {{ session.user.email }} are dropped without telling the sender.</span
          >
        </span>
      </label>

      <h3 class="mb-1 text-sm font-medium">Blocked people</h3>
      <p v-if="blocks.data.value.senders.length === 0" class="text-sm text-ink-soft">
        You haven't blocked anyone. You can block someone from the "Decline" link in their
        invitation email.
      </p>
      <ul v-else class="mb-2 space-y-1">
        <li
          v-for="sender in blocks.data.value.senders"
          :key="sender.id"
          class="flex items-center justify-between gap-3 text-sm"
        >
          <span>{{ sender.name }}</span>
          <button
            type="button"
            class="rounded-ctl border border-accent px-3 py-1 text-accent disabled:opacity-60"
            :disabled="unblock.isPending.value"
            :aria-label="`Unblock ${sender.name}`"
            @click="unblock.mutate(sender.id)"
          >
            Unblock
          </button>
        </li>
      </ul>
      <p v-if="setAll.isError.value" role="alert" class="mt-2 text-sm text-danger">
        {{ errorMessage(setAll.error.value) }}
      </p>
      <p v-if="unblock.isError.value" role="alert" class="mt-2 text-sm text-danger">
        {{ errorMessage(unblock.error.value) }}
      </p>
    </template>
  </section>
</template>
