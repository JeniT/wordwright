<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ref } from 'vue'
import { api, errorMessage } from '../lib/api'
import { joinList, MEMBER_ABILITIES, OWNER_ABILITIES } from '../lib/profile-roles'
import HoldButton from './HoldButton.vue'
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
    <p v-if="!confirmed" class="text-sm text-ink-soft">
      Confirm your email address to invite people to this profile.
    </p>
    <template v-else>
      <!-- Handing someone a role is a trust decision, so what it allows is said before the address is asked for. -->
      <div data-testid="invite-roles" class="mb-3 space-y-1 text-sm text-ink-soft">
        <p>People you invite join as members, who can {{ joinList(MEMBER_ABILITIES) }}.</p>
        <p>
          Owners can also {{ joinList(OWNER_ABILITIES) }}. You can make someone an owner after they
          join.
        </p>
      </div>
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
          class="mb-4 rounded-ctl border border-accent px-3 py-2 text-sm text-accent disabled:opacity-60"
          :disabled="invite.isPending.value"
        >
          Send invitation
        </button>
      </form>
      <p v-if="invite.isSuccess.value" role="status" class="text-sm">
        We've emailed an invitation to {{ lastInvited }}. They join once they accept it.
      </p>
      <p v-if="invite.isError.value" role="alert" class="text-sm text-danger">
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
              <span class="text-ink-soft">
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
              <HoldButton
                verb="Revoke"
                class="underline"
                title="Press and hold, or tap twice, to revoke this invitation"
                :aria-label="`Revoke invitation to ${inv.email}`"
                @confirm="revoke.mutate(inv.id)"
              >
                Revoke
              </HoldButton>
            </span>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>
