<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { computed, ref, useId, useTemplateRef } from 'vue'
import { COMMENT_MAX_LENGTH, type DraftComment } from '@wordwright/core'
import { useInlineEdit } from '../lib/inline-edit'
import { vTip } from '../lib/tip'
import HoldButton from './HoldButton.vue'
import Icon from './Icon.vue'
import PersonChip from './PersonChip.vue'
import SaveStatus from './SaveStatus.vue'
import SwitchField from './SwitchField.vue'

/**
 * One comment, in a plain box: its number (the same round marker as in the draft; the AI's in the highlighter), who
 * wrote it, what it says, and, for the draft's editor, a Resolved switch. The marker and the text together are one
 * button when the paragraph is still in the draft (pressing it shows the paragraph); a general comment (about the
 * whole draft, marked with a chip), or one whose paragraph is gone, has nothing to show. At the right of the first
 * line sit the actions: a raspberry Text changed icon button when the paragraph has been edited since (it opens the
 * old and new side by side), and, for the comment's own author while it is unresolved, Edit and Delete. Editing
 * changes only the wording and leaves a small "edited" mark; Delete is permanent. A resolved comment stays where it
 * is, quieter.
 */
const props = defineProps<{
  entry: DraftComment & { number: number }
  /** `show`: pressing it shows its paragraph. `plain`: a general comment. `static`: nothing to show. */
  kind: 'show' | 'plain' | 'static'
  active?: boolean
  /**
   * The viewer is the draft's editor: they see everyone's comments, so each names its author, and only they resolve
   * them. (A member sees only their own, so there is no need to name the author.)
   */
  isEditor?: boolean
  /** Its paragraph has been edited since (or is gone): offers the Then and Now. Never for a reviewer or a resolved comment. */
  textChanged?: boolean
  /** The viewer wrote it and it is still open: they can reword or delete it. Needs `save` and `remove`. */
  canChange?: boolean
  /** Rewords the comment; a failure is shown on the card and the form stays open. */
  save?: (text: string) => Promise<unknown>
  /** Deletes the comment for good; a failure is shown on the card. */
  remove?: () => Promise<unknown>
}>()
const emit = defineEmits<{ show: []; setResolved: [resolved: boolean]; showChange: [] }>()
const flip = useTemplateRef<InstanceType<typeof SwitchField>>('flip')
defineExpose({ revert: () => flip.value?.revert() })

const id = useId()
const draft = ref('')
const field = useTemplateRef<HTMLTextAreaElement>('field')
const editButton = useTemplateRef<HTMLButtonElement>('editButton')
const edit = useInlineEdit<'comment'>({ field: () => field.value, trigger: () => editButton.value })
const editing = computed(() => edit.editing.value !== null)
function startEdit() {
  draft.value = props.entry.text
  return edit.start('comment')
}
const stopEdit = () => edit.stop()
const saving = useMutation({
  mutationFn: () => props.save!(draft.value),
  onSuccess: stopEdit,
})
const deleting = useMutation({ mutationFn: () => props.remove!() })
</script>

<template>
  <div
    :id="`comment-${entry.id}`"
    class="panel relative p-3"
    :class="entry.resolved ? 'text-ink-soft' : ''"
  >
    <!-- Beside the number, on the first line; the text below leaves room for them. -->
    <div
      v-if="(textChanged && !entry.resolved) || (canChange && !editing)"
      class="absolute right-3 top-3 flex h-7 items-center gap-1"
    >
      <button
        v-if="textChanged && !entry.resolved"
        v-tip="'Text changed'"
        type="button"
        class="btn btn-sm btn-icon btn-ghost text-danger"
        :aria-label="`Text changed: comment ${entry.number}`"
        @click="emit('showChange')"
      >
        <Icon name="alert" />
      </button>
      <template v-if="canChange && !editing">
        <button
          ref="editButton"
          v-tip="'Edit this comment'"
          type="button"
          class="btn btn-sm btn-icon btn-ghost"
          :aria-label="`Edit comment ${entry.number}`"
          @click="startEdit"
        >
          <Icon name="edit" />
        </button>
        <HoldButton
          tip="Press and hold, or tap twice, to delete this comment"
          verb="Delete"
          class="btn btn-sm btn-icon btn-ghost btn-ghost-danger"
          :disabled="deleting.isPending.value"
          :aria-label="`Delete comment ${entry.number}`"
          @confirm="deleting.mutate()"
        >
          <Icon name="remove" />
        </HoldButton>
      </template>
    </div>
    <component
      :is="kind === 'show' && !editing ? 'button' : 'div'"
      :type="kind === 'show' && !editing ? 'button' : undefined"
      class="flex w-full items-start gap-2 text-left"
      :class="[
        kind === 'show' && !editing ? 'rounded-ctl hover:bg-sunken' : '',
        textChanged || canChange ? 'pr-24' : '',
      ]"
      :aria-current="active ? 'true' : undefined"
      :data-comment-button="kind === 'show' && !editing ? '' : undefined"
      @click="kind === 'show' && !editing && emit('show')"
    >
      <span
        class="comment-marker"
        :class="[entry.byAi && !entry.resolved ? 'is-ai' : '', active ? 'is-active' : '']"
        >{{ entry.number }}</span
      >
      <span class="block min-w-0 flex-1">
        <span
          v-if="isEditor || entry.byAi || kind === 'plain'"
          class="flex min-h-7 items-center text-sm"
        >
          <span v-if="entry.byAi" class="chip chip-ai mr-1">Your AI</span>
          <PersonChip v-else-if="isEditor" class="mr-1" :name="entry.authorName" />
          <span v-if="kind === 'plain'" class="chip chip-quiet mr-1">General</span>
        </span>
        <template v-if="!editing">
          <span
            class="block whitespace-pre-wrap"
            :class="entry.resolved ? 'text-ink-soft' : entry.byAi ? 'font-medium' : ''"
            >{{ entry.text }}</span
          >
          <span v-if="entry.edited" class="block text-sm text-ink-soft">edited</span>
          <span v-if="entry.reason" class="block text-ink-soft">{{ entry.reason }}</span>
          <span v-if="kind === 'show'" class="sr-only">Press to show it in the draft.</span>
        </template>
      </span>
    </component>
    <form v-if="editing" class="mt-2 space-y-2" @submit.prevent="saving.mutate()">
      <label class="text-sm" :for="`${id}-text`">Your comment</label>
      <textarea
        :id="`${id}-text`"
        ref="field"
        v-model="draft"
        class="field max-h-52 min-h-20"
        :maxlength="COMMENT_MAX_LENGTH"
        required
        @keydown.esc.stop="stopEdit"
      ></textarea>
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          class="btn btn-sm btn-outline"
          :disabled="saving.isPending.value || !draft.trim()"
        >
          Save
        </button>
        <button type="button" class="btn btn-sm btn-neutral" @click="stopEdit">Cancel</button>
        <SaveStatus :mutation="saving" saved="" saving="Saving…" />
      </div>
    </form>
    <p v-if="deleting.isError.value" role="alert" class="mt-2 text-sm text-danger">
      <Icon name="alert" /> We couldn’t delete that comment. Try again in a moment.
    </p>
    <SwitchField
      v-if="isEditor"
      ref="flip"
      class="mt-2"
      :model-value="entry.resolved"
      label="Resolved"
      compact
      :name="`Resolved: comment ${entry.number}`"
      @update:model-value="emit('setResolved', $event)"
    />
  </div>
</template>
