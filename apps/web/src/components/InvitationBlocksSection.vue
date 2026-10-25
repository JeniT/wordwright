<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { useTemplateRef, watch } from 'vue'
import { api } from '../lib/api'
import { invalidateRoots, queryKeys } from '../lib/queries'
import { useSessionStore } from '../stores/session'
import QueryState from './QueryState.vue'
import RowList from './RowList.vue'
import SaveStatus from './SaveStatus.vue'
import SwitchField from './SwitchField.vue'

const session = useSessionStore()
const queryClient = useQueryClient()

// Managing blocks needs a confirmed address, so an unconfirmed account can't lift someone else's.
const blocks = useQuery({
  queryKey: queryKeys.invitationBlocks(),
  queryFn: () => api.getInvitationBlocks(),
  enabled: !!session.user?.emailVerified,
  retry: false,
})
const refresh = () => invalidateRoots(queryClient, 'invitation-blocks')
const setAll = useMutation({
  mutationFn: (blocked: boolean) => api.setBlockAllInvitations(blocked),
  onSuccess: refresh,
})
const field = useTemplateRef<InstanceType<typeof SwitchField>>('field')
// Shown as soon as it is flipped; if saving fails, the switch goes back.
watch(setAll.isError, (failed) => failed && field.value?.revert())
const unblock = useMutation({
  mutationFn: (senderId: string) => api.unblockInviter(senderId),
  onSuccess: refresh,
})
</script>

<template>
  <section v-if="session.user" aria-labelledby="invite-blocks-heading">
    <h2 id="invite-blocks-heading" class="mb-3 font-display text-xl font-semibold">Invitations</h2>

    <p v-if="!session.user.emailVerified" class="text-sm text-ink-soft">
      Confirm your email address first.
    </p>
    <QueryState v-else :query="blocks" what="your invitation settings" detail>
      <template v-if="blocks.data.value">
        <SwitchField
          ref="field"
          :model-value="blocks.data.value.all"
          label="Block all invitations"
          :disabled="setAll.isPending.value"
          @update:model-value="setAll.mutate($event)"
        />
        <p class="mt-1 mb-4 text-sm text-ink-soft">Senders aren't told.</p>

        <h3 class="mb-1 text-sm font-medium">Blocked people</h3>
        <p v-if="blocks.data.value.senders.length === 0" class="text-sm text-ink-soft">
          No one blocked. Use Decline in an invitation email to block its sender.
        </p>
        <RowList
          v-else
          :items="blocks.data.value.senders"
          label="Blocked senders"
          class="mb-2 text-sm"
        >
          <template #default="{ item: sender }">
            <span class="min-w-0 flex-1">{{ sender.name }}</span>
          </template>
          <template #actions="{ item: sender }">
            <button
              type="button"
              class="btn btn-outline btn-sm"
              :disabled="unblock.isPending.value"
              :aria-label="`Unblock ${sender.name}`"
              @click="unblock.mutate(sender.id)"
            >
              Unblock
            </button>
          </template>
        </RowList>
        <SaveStatus :mutation="[setAll, unblock]" saved="" class="mt-2" />
      </template>
    </QueryState>
  </section>
</template>
