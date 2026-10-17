<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ref } from 'vue'
import { api, errorMessage } from '../lib/api'
import HoldButton from './HoldButton.vue'
import Icon from './Icon.vue'
import RowList from './RowList.vue'
import TextField from './TextField.vue'

const props = defineProps<{
  publicationId: string
  /** Inviting needs the owner's own address to be confirmed. */
  confirmed: boolean
}>()

const queryClient = useQueryClient()
const email = ref('')
const lastInvited = ref('')

const pending = useQuery({
  queryKey: ['invitations', () => props.publicationId],
  queryFn: () => api.listInvitations(props.publicationId),
  enabled: () => props.confirmed,
})
const refresh = () => queryClient.invalidateQueries({ queryKey: ['invitations'] })

const invite = useMutation({
  mutationFn: (address: string) => api.invite(props.publicationId, address),
  onSuccess: (_data, address) => {
    lastInvited.value = address
    email.value = ''
    return refresh()
  },
})
const revoke = useMutation({
  mutationFn: (id: string) => api.revokeInvitation(props.publicationId, id),
  onSuccess: refresh,
})
</script>

<template>
  <div class="mt-3">
    <p v-if="!confirmed" class="text-sm text-ink-soft">
      Confirm your email address to invite people to this publication.
    </p>
    <template v-else>
      <p class="mb-3">Invite new members.</p>
      <form class="flex items-end gap-2" @submit.prevent="invite.mutate(email)">
        <div class="flex-1">
          <TextField v-model="email" label="Email address" type="email" required />
        </div>
        <button type="submit" class="btn btn-outline mb-4" :disabled="invite.isPending.value">
          Send invitation
        </button>
      </form>
      <p v-if="invite.isSuccess.value" role="status" class="text-sm">
        Invitation sent to {{ lastInvited }}.
      </p>
      <p v-if="invite.isError.value" role="alert" class="text-sm text-danger">
        {{ errorMessage(invite.error.value) }}
      </p>

      <div v-if="pending.data.value?.length" class="mt-3">
        <h3 class="mb-2 text-sm font-medium">Waiting for a reply</h3>
        <RowList
          :items="pending.data.value"
          label="Invitations waiting for a reply"
          class="text-sm"
        >
          <template #default="{ item: inv }">
            <span class="min-w-0 flex-1 break-words">
              {{ inv.email }}
              <span class="text-ink-soft">
                · expires {{ new Date(inv.expiresAt).toLocaleDateString() }}
              </span>
            </span>
          </template>
          <template #actions="{ item: inv }">
            <button
              type="button"
              class="btn btn-sm btn-neutral"
              :aria-label="`Resend invitation to ${inv.email}`"
              @click="invite.mutate(inv.email)"
            >
              Resend
            </button>
            <HoldButton
              verb="Revoke"
              class="btn btn-sm btn-icon btn-ghost btn-ghost-danger"
              tip="Press and hold, or tap twice, to revoke this invitation"
              :aria-label="`Revoke invitation to ${inv.email}`"
              @confirm="revoke.mutate(inv.id)"
            >
              <Icon name="remove" />
            </HoldButton>
          </template>
        </RowList>
      </div>
    </template>
  </div>
</template>
