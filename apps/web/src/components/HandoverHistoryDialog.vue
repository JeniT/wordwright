<script setup lang="ts">
import type { HandoverEvent } from '@wordwright/core'
import { useHandover } from '../lib/draft-people'
import ModalDialog from './ModalDialog.vue'

/** Every offer, request and reassignment on the draft, in words, for any member to read. */
const props = defineProps<{ open: boolean; publicationId: string; draftId: string }>()
const emit = defineEmits<{ close: [] }>()
const { handover } = useHandover(
  () => props.publicationId,
  () => props.draftId,
)

const person = (name: string | null) => name ?? 'a former member'
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
const outcome: Record<string, string> = {
  pending: 'waiting for a reply',
  accepted: 'accepted',
  declined: 'declined',
  withdrawn: 'withdrawn',
  dismissed: 'set aside',
  fulfilled: 'answered',
}
function describe(e: HandoverEvent): string {
  const actor = person(e.actorName)
  const member = person(e.memberName)
  if (e.kind === 'reassign') {
    return e.automatic
      ? `Passed to ${member} when the previous editor left`
      : `Reassigned by ${actor} to ${member}`
  }
  const said =
    e.kind === 'offer' ? `${actor} offered the draft to ${member}` : `${actor} asked for the draft`
  return `${said}: ${outcome[e.status]}`
}
</script>

<template>
  <ModalDialog :open="open" title="Handover history" @close="emit('close')">
    <ul class="space-y-1 text-ink-soft">
      <li v-for="e in handover.data.value?.history ?? []" :key="e.id">
        {{ describe(e) }}, {{ when(e.createdAt) }}
      </li>
    </ul>
  </ModalDialog>
</template>
