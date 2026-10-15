<script setup lang="ts">
import type { Publication, PublicationMember, PublicationRole } from '@wordwright/core'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, useId } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../lib/api'
import { MEMBER_ABILITIES_TEXT, OWNER_ABILITIES } from '../lib/publication-roles'
import { useSessionStore } from '../stores/session'
import ConfirmDialog from './ConfirmDialog.vue'
import SaveStatus from './SaveStatus.vue'

const props = defineProps<{ publication: Publication }>()
const session = useSessionStore()
const router = useRouter()
const queryClient = useQueryClient()
const refresh = () => queryClient.invalidateQueries({ queryKey: ['publications'] })

const isOwner = computed(() => props.publication.role === 'owner')
const onlyOwner = computed(
  () => props.publication.members.filter((m) => m.role === 'owner').length === 1,
)
const isMe = (m: PublicationMember) => m.userId === session.user?.id
const hintId = useId()

// ---- leaving and removing
// Asks first: the person's drafts move to an owner and they lose access, which only an invitation brings back.
const removing = ref<PublicationMember | null>(null)
const removingSelf = computed(() => !!removing.value && isMe(removing.value))
const removeMember = useMutation({
  mutationFn: (userId: string) => api.removeMember(props.publication.id, userId),
  onSuccess: async (_, userId) => {
    removing.value = null // before the refresh, so the dialog never lingers over the updated list
    await refresh()
    if (userId === session.user?.id) await router.push('/') // you left; it's no longer yours to see
  },
  onSettled: () => (removing.value = null), // a failure shows in the status line below the list
})
const canRemove = (m: PublicationMember) =>
  (isOwner.value && m.role !== 'owner') || (!isOwner.value && isMe(m))

// ---- owners
// A role changes what someone can do, so it asks first and says what changes.
const pending = ref<{ member: PublicationMember; role: PublicationRole } | null>(null)
const changed = ref('')
const setRole = useMutation({
  mutationFn: (change: { member: PublicationMember; role: PublicationRole }) =>
    api.setMemberRole(props.publication.id, change.member.userId, change.role),
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
  if (stepping.value) return `Step down as owner of ${props.publication.name}?`
  return promoting.value
    ? `Make ${who} an owner of ${props.publication.name}?`
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
      v-for="m in publication.members"
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
          v-if="isOwner && isMe(m) && publication.members.length > 1"
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
          @click="removing = m"
        >
          {{ isMe(m) ? 'Leave' : 'Remove' }}
        </button>
      </span>
    </li>
  </ul>
  <p
    v-if="isOwner && onlyOwner && publication.members.length > 1"
    :id="hintId"
    class="mt-2 text-sm text-ink-soft"
  >
    You are the only owner. Make someone else an owner first, or delete the publication.
  </p>
  <SaveStatus :mutation="setRole" class="mt-2"
    ><span>{{ changed }}</span></SaveStatus
  >
  <SaveStatus :mutation="removeMember" saved="" class="mt-2" />

  <ConfirmDialog
    :open="removing !== null"
    :title="
      removingSelf
        ? `Leave ${publication.name}?`
        : `Remove ${removing?.name} from ${publication.name}?`
    "
    :confirm-label="removingSelf ? 'Leave' : `Remove ${removing?.name}`"
    busy-label="Removing…"
    :busy="removeMember.isPending.value"
    @confirm="removing && removeMember.mutate(removing.userId)"
    @cancel="removing = null"
  >
    <template v-if="removing">
      <p v-if="removingSelf">
        You will lose access to its ideas, notes and drafts. Drafts you edit go to the publication's
        longest-standing owner, any handover you had open is closed, and what you wrote stays with
        your name. You can come back only if an owner invites you again.
      </p>
      <p v-else>
        {{ removing.name }} will lose access to its ideas, notes and drafts. Drafts they edit go to
        the publication's longest-standing owner, any handover they had open is closed, and what
        they wrote stays with their name. You can invite them again later.
      </p>
    </template>
  </ConfirmDialog>

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
