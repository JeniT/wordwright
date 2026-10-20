<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Proposal } from '@wordwright/core'
import { useInlineEdit } from '../lib/inline-edit'
import { vTip } from '../lib/tip'
import Icon from './Icon.vue'

/**
 * One note your AI suggested, with the three things you can do about it: edit it, add it to the notes, or ignore it
 * (and, once ignored, bring it back). The text is the AI's until it is added, so it is in the highlighter.
 */
const props = defineProps<{
  proposal: Proposal
  busy: boolean
  /** Saves an edit; rejects if it could not be saved (the reason is shown by the list). */
  save: (changes: { text: string }) => Promise<unknown>
}>()
const emit = defineEmits<{ decide: [what: 'accept' | 'dismiss' | 'reopen'] }>()

const text = computed(() => props.proposal.input.text ?? '')
// Long notes are named by their start, so each button says which note it acts on.
const short = computed(() => (text.value.length > 40 ? `${text.value.slice(0, 40)}…` : text.value))
const accepted = computed(() => props.proposal.status === 'accepted')

const draft = ref('')
const field = ref<HTMLTextAreaElement>()
const editButton = ref<HTMLButtonElement>()
const edit = useInlineEdit<'note'>({ field: () => field.value, trigger: () => editButton.value })
function startEditing() {
  draft.value = text.value
  void edit.start('note')
}
async function submit() {
  const next = draft.value.trim()
  if (!next) return
  if (next === text.value) return void edit.stop()
  try {
    await props.save({ text: next })
    void edit.stop()
  } catch {
    // The list says why it could not be saved, and the field stays open.
  }
}
</script>

<template>
  <li class="flex gap-3 px-3 py-2">
    <!-- Decided: the note, how it went, and (if ignored) a way back. -->
    <template v-if="proposal.status !== 'pending'">
      <div class="flex min-w-0 flex-1 items-start gap-2">
        <span v-if="accepted" class="font-bold text-ok" role="img" aria-label="Added to the notes"
          >✓</span
        >
        <span v-else class="font-bold text-danger" role="img" aria-label="Ignored">✗</span>
        <span
          class="min-w-0 flex-1 whitespace-pre-wrap break-words"
          :class="accepted ? '' : 'text-ink-soft'"
          >{{ text }}
          <span class="text-sm text-ink-soft">
            ·
            {{
              accepted
                ? `added to the notes${proposal.decidedByName ? ` by ${proposal.decidedByName}` : ''}`
                : 'ignored'
            }}</span
          ></span
        >
      </div>
      <button
        v-if="!accepted"
        v-tip="'Stop ignoring'"
        type="button"
        class="btn btn-sm btn-icon btn-ghost shrink-0"
        :disabled="busy"
        :aria-label="`Stop ignoring: ${short}`"
        @click="emit('decide', 'reopen')"
      >
        <Icon name="undo" />
      </button>
    </template>
    <!-- Waiting: what it says, and what can be done. -->
    <template v-else>
      <div class="min-w-0 flex-1">
        <form v-if="edit.editing.value" class="space-y-2" @submit.prevent="submit">
          <textarea
            ref="field"
            v-model="draft"
            rows="3"
            class="field"
            aria-label="Suggested note"
            @keydown.escape="edit.stop()"
            @keydown.enter.ctrl.exact.prevent="submit"
            @keydown.enter.meta.exact.prevent="submit"
          ></textarea>
          <div class="flex gap-2">
            <button type="submit" class="btn btn-sm btn-primary" :disabled="!draft.trim() || busy">
              Save
            </button>
            <button type="button" class="btn btn-sm btn-neutral" @click="edit.stop()">
              Cancel
            </button>
          </div>
        </form>
        <p v-else class="whitespace-pre-wrap break-words">
          <span class="bg-mark">{{ text }}</span>
        </p>
      </div>
      <div v-if="!edit.editing.value" class="flex shrink-0 items-start gap-2">
        <button
          ref="editButton"
          v-tip="'Edit suggested note'"
          type="button"
          class="btn btn-sm btn-icon btn-ghost"
          :disabled="busy"
          :aria-label="`Edit suggested note: ${short}`"
          @click="startEditing"
        >
          <Icon name="edit" />
        </button>
        <button
          v-tip="'Add to notes'"
          type="button"
          class="btn btn-sm btn-icon btn-ghost"
          :disabled="busy"
          :aria-label="`Add to notes: ${short}`"
          @click="emit('decide', 'accept')"
        >
          <Icon name="check" />
        </button>
        <button
          v-tip="'Ignore'"
          type="button"
          class="btn btn-sm btn-icon btn-ghost"
          :disabled="busy"
          :aria-label="`Ignore: ${short}`"
          @click="emit('decide', 'dismiss')"
        >
          <Icon name="close" />
        </button>
      </div>
    </template>
  </li>
</template>
