<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ref } from 'vue'
import { api, errorMessage } from '../lib/api'
import TextField from './TextField.vue'

const props = defineProps<{
  profileId: string
  profileName: string
  /** Inviting needs the owner's own address to be confirmed. */
  confirmed: boolean
}>()

const queryClient = useQueryClient()
const email = ref('')
const lastInvited = ref('')

const pending = useQuery({
  queryKey: ['invitations', () => props.profileId],
  queryFn: () => api.listInvitations(props.profileId),
  enabled: () => props.confirmed,
})
const refresh = () => queryClient.invalidateQueries({ queryKey: ['invitations'] })

const invite = useMutation({
  mutationFn: (address: string) => api.invite(props.profileId, address),
  onSuccess: (_data, address) => {
    lastInvited.value = address
    email.value = ''
    return refresh()
  },
})
const revoke = useMutation({
  mutationFn: (id: string) => api.revokeInvitation(props.profileId, id),
  onSuccess: refresh,
})
</script>

<template>
  <div class="mt-3">
    <p v-if="!confirmed" class="text-sm text-stone-700">
      Confirm your email address to invite people to this profile.
    </p>
    <template v-else>
      <form class="flex items-end gap-2" @submit.prevent="invite.mutate(email)">
        <div class="flex-1">
          <TextField
            v-model="email"
            :label="`Invite someone to “${profileName}” (their email address)`"
            type="email"
            required
          />
        </div>
        <button
          type="submit"
          class="mb-4 rounded border border-accent px-3 py-2 text-sm text-accent disabled:opacity-60"
          :disabled="invite.isPending.value"
        >
          Send invitation
        </button>
      </form>
      <p v-if="invite.isSuccess.value" role="status" class="text-sm">
        We've emailed an invitation to {{ lastInvited }}. They join once they accept it.
      </p>
      <p v-if="invite.isError.value" role="alert" class="text-sm text-red-700">
        {{ errorMessage(invite.error.value) }}
      </p>

      <div v-if="pending.data.value?.length" class="mt-3">
        <h3 class="text-sm font-medium">Waiting for a reply</h3>
        <ul class="mt-1 text-sm">
          <li
            v-for="inv in pending.data.value"
            :key="inv.id"
            class="flex items-center justify-between gap-3 py-1"
          >
            <span>
              {{ inv.email }}
              <span class="text-stone-600">
                · expires {{ new Date(inv.expiresAt).toLocaleDateString() }}
              </span>
            </span>
            <span class="flex gap-3">
              <button
                type="button"
                class="underline"
                :aria-label="`Resend invitation to ${inv.email}`"
                @click="invite.mutate(inv.email)"
              >
                Resend
              </button>
              <button
                type="button"
                class="underline"
                :aria-label="`Revoke invitation to ${inv.email}`"
                @click="revoke.mutate(inv.id)"
              >
                Revoke
              </button>
            </span>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>
