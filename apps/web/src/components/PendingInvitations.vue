<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, errorMessage } from '../lib/api'
import { invalidateRoots, queryKeys } from '../lib/queries'
import QueryState from './QueryState.vue'
import RowList from './RowList.vue'

/**
 * Invitations to join a publication that are waiting for this person's confirmed address, on Home, so they don't have
 * to find the emailed link. Joining is a button, never automatic: nobody is added without choosing to be. Declining
 * offers the same "stop invitations" choices as the page behind the email link. Shows nothing while there is none.
 */
const router = useRouter()
const queryClient = useQueryClient()
const invitations = useQuery({
  queryKey: queryKeys.myInvitations(),
  queryFn: () => api.listMyInvitations(),
})

const declining = ref<string | null>(null)
const block = ref<'none' | 'sender' | 'all'>('none')
const problem = ref<{ id: string; message: string } | null>(null)

const join = useMutation({
  mutationFn: (id: string) => api.acceptMyInvitation(id),
  onMutate: () => (problem.value = null),
  onSuccess: async ({ publicationId }) => {
    await Promise.all([
      invalidateRoots(queryClient, 'my-invitations'),
      queryClient.invalidateQueries({ queryKey: ['publications'] }),
    ])
    await router.push({ name: 'publication', params: { publicationId } })
  },
  onError: (err, id) => (problem.value = { id, message: errorMessage(err) }),
})
const decline = useMutation({
  mutationFn: (id: string) => api.declineMyInvitation(id, block.value),
  onMutate: () => (problem.value = null),
  onSuccess: async () => {
    declining.value = null
    block.value = 'none'
    await invalidateRoots(queryClient, 'my-invitations')
  },
  onError: (err, id) => (problem.value = { id, message: errorMessage(err) }),
})

function startDeclining(id: string) {
  declining.value = declining.value === id ? null : id
  block.value = 'none'
  problem.value = null
}
</script>

<template>
  <QueryState v-if="invitations.isError.value" :query="invitations" what="your invitations" />
  <section
    v-else-if="invitations.data.value?.length"
    class="mb-10 panel p-5"
    aria-labelledby="invitations-heading"
  >
    <h2 id="invitations-heading" class="mb-3 font-display text-xl font-semibold">Invitations</h2>
    <RowList :items="invitations.data.value" label="Invitations">
      <template #default="{ item }">
        <p class="min-w-0 flex-1">
          <strong>{{ item.inviterName }}</strong> invited you to write together on
          <strong>{{ item.publicationName }}</strong
          >.
        </p>
      </template>
      <template #actions="{ item }">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :aria-label="`Join ${item.publicationName}`"
          :disabled="join.isPending.value"
          @click="join.mutate(item.id)"
        >
          Join
        </button>
        <button
          type="button"
          class="btn btn-outline btn-sm"
          :aria-label="`Decline ${item.publicationName}`"
          :aria-expanded="declining === item.id"
          @click="startDeclining(item.id)"
        >
          Decline
        </button>
      </template>
    </RowList>
    <template v-for="item in invitations.data.value" :key="item.id">
      <form
        v-if="declining === item.id"
        class="mt-3 text-sm"
        @submit.prevent="decline.mutate(item.id)"
      >
        <fieldset>
          <legend class="mb-2 font-medium">Decline {{ item.publicationName }}, and</legend>
          <label class="mb-2 flex items-start gap-2">
            <input v-model="block" type="radio" name="block" value="none" />
            <span>Just decline this one</span>
          </label>
          <label class="mb-2 flex items-start gap-2">
            <input v-model="block" type="radio" name="block" value="sender" />
            <span>Stop invitations from {{ item.inviterName }}</span>
          </label>
          <label class="mb-2 flex items-start gap-2">
            <input v-model="block" type="radio" name="block" value="all" />
            <span>Stop invitations from everyone</span>
          </label>
        </fieldset>
        <button type="submit" class="btn btn-outline btn-sm" :disabled="decline.isPending.value">
          Decline
        </button>
        <p class="mt-2 text-ink-soft">{{ item.inviterName }} isn't told that you declined.</p>
      </form>
    </template>
    <p v-if="problem" role="alert" class="mt-3 text-danger">{{ problem.message }}</p>
  </section>
</template>
