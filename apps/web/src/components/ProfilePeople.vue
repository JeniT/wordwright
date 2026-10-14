<script setup lang="ts">
import type { Profile, ProfileMember, ProfileRole } from '@lfwa/core'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, useId } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../lib/api'
import { MEMBER_ABILITIES_TEXT, OWNER_ABILITIES } from '../lib/profile-roles'
import { useSessionStore } from '../stores/session'
import ConfirmDialog from './ConfirmDialog.vue'
import SaveStatus from './SaveStatus.vue'

const props = defineProps<{ profile: Profile }>()
const session = useSessionStore()
const router = useRouter()
const queryClient = useQueryClient()
const refresh = () => queryClient.invalidateQueries({ queryKey: ['profiles'] })

const isOwner = computed(() => props.profile.role === 'owner')
const onlyOwner = computed(
  () => props.profile.members.filter((m) => m.role === 'owner').length === 1,
)
const isMe = (m: ProfileMember) => m.userId === session.user?.id
const hintId = useId()

// ---- leaving and removing
const removeMember = useMutation({
  mutationFn: (userId: string) => api.removeMember(props.profile.id, userId),
  onSuccess: async (_, userId) => {
    await refresh()
    if (userId === session.user?.id) await router.push('/') // you left; it's no longer yours to see
  },
})
const canRemove = (m: ProfileMember) =>
  (isOwner.value && m.role !== 'owner') || (!isOwner.value && isMe(m))

// ---- owners
// A role changes what someone can do, so it asks first and says what changes.
const pending = ref<{ member: ProfileMember; role: ProfileRole } | null>(null)
const changed = ref('')
const setRole = useMutation({
  mutationFn: (change: { member: ProfileMember; role: ProfileRole }) =>
    api.setMemberRole(props.profile.id, change.member.userId, change.role),
  onSuccess: (_, { member, role }) => {
    pending.value = null // before the refresh, so the dialog never lingers over the updated list
    changed.value = isMe(member)
      ? 'You are no longer an owner.'
      : role === 'owner'
        ? `${member.name} is now an owner.`
        : `${member.name} is no longer an owner.`
    return refresh()
  },
  onSettled: () => (pending.value = null),
})

const stepping = computed(() => !!pending.value && isMe(pending.value.member))
const promoting = computed(() => pending.value?.role === 'owner')
const title = computed(() => {
  const who = pending.value?.member.name
  if (stepping.value) return `Step down as owner of ${props.profile.name}?`
  return promoting.value
    ? `Make ${who} an owner of ${props.profile.name}?`
    : `Remove ${who} as an owner?`
})
const confirmLabel = computed(() => {
  if (stepping.value) return 'Step down as owner'
  return promoting.value ? `Make ${pending.value?.member.name} an owner` : 'Remove as owner'
})
</script>

<template>
  <ul class="text-sm">
    <li
      v-for="m in profile.members"
      :key="m.userId"
      class="flex flex-wrap items-center justify-between gap-2 py-1"
    >
      <span>
        {{ m.name }}
        <span class="text-ink-soft">({{ m.email }}, {{ m.role }})</span>
      </span>
      <span class="flex flex-wrap items-center gap-3">
        <button
          v-if="isOwner && m.role === 'member'"
          type="button"
          class="btn btn-sm btn-outline"
          :aria-label="`Make owner ${m.name}`"
          @click="pending = { member: m, role: 'owner' }"
        >
          Make owner
        </button>
        <button
          v-if="isOwner && m.role === 'owner' && !isMe(m)"
          type="button"
          class="btn btn-sm btn-outline"
          :aria-label="`Remove as owner ${m.name}`"
          @click="pending = { member: m, role: 'member' }"
        >
          Remove as owner
        </button>
        <button
          v-if="isOwner && isMe(m) && profile.members.length > 1"
          type="button"
          class="btn btn-sm btn-outline"
          :disabled="onlyOwner"
          :aria-describedby="onlyOwner ? hintId : undefined"
          @click="pending = { member: m, role: 'member' }"
        >
          Step down as owner
        </button>
        <button
          v-if="canRemove(m)"
          type="button"
          class="underline"
          :aria-label="isMe(m) ? undefined : `Remove ${m.name}`"
          @click="removeMember.mutate(m.userId)"
        >
          {{ isMe(m) ? 'Leave' : 'Remove' }}
        </button>
      </span>
    </li>
  </ul>
  <p
    v-if="isOwner && onlyOwner && profile.members.length > 1"
    :id="hintId"
    class="mt-2 text-sm text-ink-soft"
  >
    You are the only owner. Make someone else an owner first, or delete the profile.
  </p>
  <SaveStatus :mutation="setRole" class="mt-2"
    ><span>{{ changed }}</span></SaveStatus
  >
  <SaveStatus :mutation="removeMember" saved="" class="mt-2" />

  <ConfirmDialog
    :open="pending !== null"
    :title="title"
    :confirm-label="confirmLabel"
    confirm-tone="primary"
    busy-label="Saving…"
    :busy="setRole.isPending.value"
    @confirm="pending && setRole.mutate(pending)"
    @cancel="pending = null"
  >
    <template v-if="pending">
      <p v-if="promoting">{{ pending.member.name }} will be able to:</p>
      <p v-else-if="stepping">You will no longer be able to:</p>
      <p v-else>{{ pending.member.name }} will no longer be able to:</p>
      <ul class="my-2 list-disc pl-5">
        <li v-for="ability in OWNER_ABILITIES" :key="ability">{{ ability }}</li>
      </ul>
      <p v-if="promoting">
        {{ pending.member.name }} will still be able to {{ MEMBER_ABILITIES_TEXT }}. Another owner
        can remove them as an owner later.
      </p>
      <p v-else-if="stepping">
        You stay a member and keep your own drafts. Only another owner can give them back.
      </p>
      <p v-else>{{ pending.member.name }} stays a member and keeps their own drafts.</p>
    </template>
  </ConfirmDialog>
</template>
