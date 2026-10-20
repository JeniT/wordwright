<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { Idea, Proposal } from '@wordwright/core'
import { useInlineEdit } from '../lib/inline-edit'
import { vTip } from '../lib/tip'
import Icon from './Icon.vue'

/**
 * A new idea, or a new title for this idea, that your AI suggested: laid out like the rest of the suggestions, with
 * edit, add and ignore. The words are the AI's until they are used, so they are in the highlighter.
 */
const props = defineProps<{
  publicationId: string
  /** The idea as it is now, to show a title against what it would replace. */
  idea: Idea
  proposal: Proposal
  busy: boolean
  /** Saves an edit; rejects if it could not be saved (the reason is shown by the list). */
  save: (changes: { name?: string; notes?: string }) => Promise<unknown>
}>()
const emit = defineEmits<{ decide: [what: 'accept' | 'dismiss' | 'reopen'] }>()

const isTitle = computed(() => props.proposal.tool === 'update_idea')
const name = computed(() => props.proposal.input.name ?? '')
const notes = computed(() => props.proposal.input.notes ?? '')
const accepted = computed(() => props.proposal.status === 'accepted')
// Says what each button acts on, since there may be several rows.
const what = computed(() =>
  isTitle.value ? `a new title, “${name.value}”` : `a new idea, “${name.value}”`,
)
const addLabel = computed(() => {
  if (isTitle.value) return props.proposal.stale ? 'Apply anyway' : 'Use this title'
  return 'Create idea'
})

const nameDraft = ref('')
const notesDraft = ref('')
const nameField = ref<HTMLInputElement>()
const editButton = ref<HTMLButtonElement>()
const edit = useInlineEdit<'idea'>({
  field: () => nameField.value,
  trigger: () => editButton.value,
})
function startEditing() {
  nameDraft.value = name.value
  notesDraft.value = notes.value
  void edit.start('idea')
}
async function submit() {
  const nextName = nameDraft.value.trim()
  if (!nextName) return
  const changes: { name?: string; notes?: string } = {}
  if (nextName !== name.value) changes.name = nextName
  if (!isTitle.value && notesDraft.value !== notes.value) changes.notes = notesDraft.value
  if (!Object.keys(changes).length) return void edit.stop()
  try {
    await props.save(changes)
    void edit.stop()
  } catch {
    // The list says why it could not be saved, and the form stays open.
  }
}
</script>

<template>
  <li class="flex gap-3 px-3 py-2">
    <!-- Decided: what it was, how it went, and (if ignored) a way back. -->
    <template v-if="proposal.status !== 'pending'">
      <div class="flex min-w-0 flex-1 items-start gap-2">
        <span
          v-if="accepted"
          class="font-bold text-ok"
          role="img"
          :aria-label="isTitle ? 'Used as the title' : 'Created'"
          >✓</span
        >
        <span v-else class="font-bold text-danger" role="img" aria-label="Ignored">✗</span>
        <span class="min-w-0 flex-1 break-words" :class="accepted ? '' : 'text-ink-soft'"
          >{{ name }}
          <span class="text-sm text-ink-soft">
            ·
            {{
              accepted
                ? isTitle
                  ? 'used as the title'
                  : 'created'
                : isTitle
                  ? 'title ignored'
                  : 'idea ignored'
            }}{{ accepted && proposal.decidedByName ? ` by ${proposal.decidedByName}` : '' }}
            <RouterLink
              v-if="accepted && proposal.createdIdeaId"
              :to="{
                name: 'idea-notes',
                params: { publicationId, id: proposal.createdIdeaId },
              }"
              class="link"
              >Open the new idea</RouterLink
            ></span
          ></span
        >
      </div>
      <button
        v-if="!accepted"
        v-tip="'Stop ignoring'"
        type="button"
        class="btn btn-sm btn-icon btn-ghost shrink-0"
        :disabled="busy"
        :aria-label="`Stop ignoring: ${what}`"
        @click="emit('decide', 'reopen')"
      >
        <Icon name="undo" />
      </button>
    </template>
    <!-- Waiting. -->
    <template v-else>
      <div class="min-w-0 flex-1">
        <form v-if="edit.editing.value" class="space-y-2" @submit.prevent="submit">
          <input
            ref="nameField"
            v-model="nameDraft"
            type="text"
            class="field"
            :aria-label="isTitle ? 'Suggested title' : 'Suggested idea'"
            @keydown.escape="edit.stop()"
          />
          <textarea
            v-if="!isTitle"
            v-model="notesDraft"
            rows="4"
            class="field"
            aria-label="Starting notes"
            @keydown.escape="edit.stop()"
          ></textarea>
          <div class="flex gap-2">
            <button
              type="submit"
              class="btn btn-sm btn-primary"
              :disabled="!nameDraft.trim() || busy"
            >
              Save
            </button>
            <button type="button" class="btn btn-sm btn-neutral" @click="edit.stop()">
              Cancel
            </button>
          </div>
        </form>
        <template v-else>
          <p class="meta">{{ isTitle ? 'New title for this idea' : 'New idea' }}</p>
          <p v-if="isTitle" class="text-sm text-ink-soft">
            Now: <span class="line-through decoration-line-strong">{{ idea.name }}</span>
            <span class="sr-only">(would be replaced)</span>
          </p>
          <p class="break-words font-medium">
            <span class="bg-mark">{{ name }}</span>
          </p>
          <p v-if="!isTitle && notes" class="whitespace-pre-wrap break-words text-sm">
            <span class="bg-mark">{{ notes }}</span>
          </p>
          <p
            v-if="proposal.stale"
            role="status"
            class="mt-1 flex items-start gap-1 rounded-ctl bg-accent-wash p-2 text-sm"
          >
            <Icon name="alert" class="mt-0.5 shrink-0" />
            <span>
              The title has changed since this was suggested. Using it will replace the title as it
              is now.
            </span>
          </p>
        </template>
      </div>
      <div v-if="!edit.editing.value" class="flex shrink-0 items-start gap-2">
        <button
          ref="editButton"
          v-tip="isTitle ? 'Edit suggested title' : 'Edit suggested idea'"
          type="button"
          class="btn btn-sm btn-icon btn-ghost"
          :disabled="busy"
          :aria-label="`Edit ${what}`"
          @click="startEditing"
        >
          <Icon name="edit" />
        </button>
        <button
          v-tip="addLabel"
          type="button"
          class="btn btn-sm btn-icon btn-ghost"
          :disabled="busy"
          :aria-label="`${addLabel}: ${what}`"
          @click="emit('decide', 'accept')"
        >
          <Icon name="check" />
        </button>
        <button
          v-tip="'Ignore'"
          type="button"
          class="btn btn-sm btn-icon btn-ghost"
          :disabled="busy"
          :aria-label="`Ignore: ${what}`"
          @click="emit('decide', 'dismiss')"
        >
          <Icon name="close" />
        </button>
      </div>
    </template>
  </li>
</template>
