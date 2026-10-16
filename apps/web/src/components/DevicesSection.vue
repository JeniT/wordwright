<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { SignedInDevice } from '@wordwright/core'
import { computed, ref } from 'vue'
import { api } from '../lib/api'
import { queryKeys, invalidateRoots } from '../lib/queries'
import ConfirmDialog from './ConfirmDialog.vue'
import Icon from './Icon.vue'
import QueryState from './QueryState.vue'
import SaveStatus from './SaveStatus.vue'

const queryClient = useQueryClient()
const devices = useQuery({ queryKey: queryKeys.devices(), queryFn: () => api.getDevices() })
const others = computed(() => (devices.data.value ?? []).filter((d) => !d.current))

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const confirming = ref(false)
const signOutOne = useMutation({
  mutationFn: (device: SignedInDevice) => api.signOutDevice(device.id),
  onSettled: () => invalidateRoots(queryClient, 'devices'),
})
const signOutAll = useMutation({
  mutationFn: () => api.signOutOtherDevices(),
  // Closed either way: a failure is said beside the button, where the person can try again.
  onSettled: () => {
    confirming.value = false
    return invalidateRoots(queryClient, 'devices')
  },
})
const start = (run: () => void, other: { reset: () => void }) => {
  other.reset()
  run()
}
const devicesWord = (n: number) => `${n} other ${n === 1 ? 'device' : 'devices'}`
</script>

<template>
  <section aria-labelledby="devices-heading">
    <h2 id="devices-heading" class="mb-1 font-display text-xl font-semibold">
      Where you're signed in
    </h2>
    <p class="mb-3 text-sm text-ink-soft">
      If you lose a laptop or used a shared computer, sign it out here. Changing or resetting your
      password also signs you out everywhere else; changing your email address doesn't. We keep only
      the kind of browser and system, and when it was last used: never where it was.
    </p>
    <QueryState :query="devices" what="where you're signed in">
      <ul class="panel mb-3 divide-y divide-line">
        <li
          v-for="device in devices.data.value"
          :key="device.id"
          class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
        >
          <div class="min-w-0">
            <p class="font-medium">
              {{ device.deviceLabel }}
              <span v-if="device.current" class="chip chip-quiet ml-1">This device</span>
            </p>
            <p class="meta">
              Last used <time :datetime="device.lastUsedAt">{{ when(device.lastUsedAt) }}</time>
            </p>
          </div>
          <button
            v-if="!device.current"
            type="button"
            class="btn btn-sm btn-ghost"
            :aria-label="`Sign out ${device.deviceLabel}, last used ${when(device.lastUsedAt)}`"
            :disabled="signOutOne.isPending.value"
            @click="start(() => signOutOne.mutate(device), signOutAll)"
          >
            <Icon name="sign-out" :size="16" />
            Sign out
          </button>
        </li>
      </ul>
      <p v-if="!others.length" class="mb-3 text-sm text-ink-soft">Only this device is signed in</p>
      <button
        v-else
        type="button"
        class="btn btn-outline"
        :disabled="signOutAll.isPending.value"
        @click="confirming = true"
      >
        Sign out everywhere else
      </button>
    </QueryState>
    <SaveStatus :mutation="signOutOne">
      Signed out of {{ signOutOne.variables.value?.deviceLabel }}
    </SaveStatus>
    <SaveStatus :mutation="signOutAll">
      Signed out of {{ devicesWord(signOutAll.data.value?.count ?? 0) }}
    </SaveStatus>
    <ConfirmDialog
      :open="confirming"
      title="Sign out everywhere else?"
      confirm-label="Sign out everywhere else"
      busy-label="Signing out…"
      confirm-tone="primary"
      :busy="signOutAll.isPending.value"
      @confirm="start(() => signOutAll.mutate(), signOutOne)"
      @cancel="confirming = false"
    >
      <p>
        Every other device where you're signed in will be signed out. You stay signed in on this
        one.
      </p>
    </ConfirmDialog>
  </section>
</template>
