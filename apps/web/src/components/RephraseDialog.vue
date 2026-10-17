<script setup lang="ts">
import { useMutation } from '@tanstack/vue-query'
import { computed, ref, useId, watch } from 'vue'
import {
  CRITIQUE_ROUNDS_DEFAULT,
  REPHRASE,
  countWords,
  normalizeText,
  wordingProblem,
  type RephraseResult,
  type RephraseRound,
} from '@wordwright/core'
import { api, errorMessage } from '../lib/api'
import { useModal } from '../lib/modal'
import AiButton from './AiButton.vue'
import RephraseOptions from './RephraseOptions.vue'

/**
 * Rephrase: options for a passage of the draft, or its title. The writer sees the words, says what they should do
 * (the Aim) and asks; the options that come back are ways they might say it. Choosing one only puts it in the
 * wording field, where it can be changed; "Use this" is what finally hands the words back. The window holds
 * everything: the server counts nothing, so closing it and opening it again starts from round 1.
 * See docs/responsible-ai.md (principle 4) and docs/decisions.md ("Rephrase").
 */
const props = defineProps<{
  open: boolean
  kind: 'title' | 'passage'
  /** The selected passage, or the title, as it is now. */
  wording: string
  publicationId: string
  draftId: string
  /** How many rounds this window allows: the writer's critique-looks setting. */
  rounds?: number
  /** Only some of the passage's words are formatted (bold, italic, linked), so new wording goes in plain. */
  mixedFormatting?: boolean
  /** Runs before each request, to save the draft: the AI reads the saved draft. */
  prepare?: () => Promise<unknown>
}>()
const emit = defineEmits<{
  cancel: []
  /** The words to put in the draft; `offered` and `aim` say which option they began as, if any was chosen. */
  use: [result: { text: string; offered: string | null; aim: string | null }]
}>()

const titleId = useId()
const hintId = useId()
const dialog = ref<HTMLElement | null>(null)
const aimField = ref<HTMLTextAreaElement | null>(null)

const text = ref('')
const aim = ref('')
const asked = ref<RephraseRound[]>([])
const result = ref<RephraseResult | null>(null)
/** The option last put in the wording field, and the aim it was offered for. */
const picked = ref<{ offered: string; aim: string } | null>(null)
const announcement = ref('')

useModal({
  open: () => props.open,
  dialog,
  onEscape: () => emit('cancel'),
  canEscape: () => !generate.isPending.value,
  initialFocus: () => aimField.value,
})

const limit = computed(() => props.rounds ?? CRITIQUE_ROUNDS_DEFAULT)
const wordingIssue = computed(() => wordingProblem(props.kind, text.value))

/** Why options cannot be asked for yet, in words that say what to do; null when they can. */
const blocker = computed(() => {
  if (asked.value.length >= limit.value) {
    return `You have had your ${limit.value} ${limit.value === 1 ? 'round' : 'rounds'} of options here. Choose one, or write it yourself, then use it. Opening this window again starts afresh.`
  }
  if (wordingIssue.value) return wordingIssue.value
  if (countWords(aim.value) < REPHRASE.aimMinWords) {
    return 'Say in a few words what you want this to do, so the options fit.'
  }
  const now = normalizeText(aim.value)
  if (asked.value.some((r) => normalizeText(r.aim) === now)) {
    return `Change your aim to ask again: say what you'd like to be different.`
  }
  return null
})

const generate = useMutation({
  mutationFn: async () => {
    await props.prepare?.()
    return api.rephrase(props.publicationId, {
      draftId: props.draftId,
      kind: props.kind,
      wording: text.value,
      aim: aim.value,
      earlier: asked.value,
    })
  },
  onSuccess: (made) => {
    asked.value = [...asked.value, { aim: aim.value, options: made.options }]
    result.value = made
    announcement.value = `${made.options.length} options. Round ${asked.value.length} of ${limit.value}.`
  },
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    text.value = props.wording
    aim.value = ''
    asked.value = []
    result.value = null
    picked.value = null
    announcement.value = ''
    generate.reset()
  },
  { immediate: true },
)

function pick(option: string) {
  text.value = option
  picked.value = { offered: option, aim: asked.value.at(-1)?.aim ?? aim.value }
  announcement.value = 'The wording is now this option. Change it if you like, then use it.'
}

const unchanged = computed(() => text.value.trim() === props.wording.trim())
const canUse = computed(() => !!text.value.trim() && !unchanged.value && !generate.isPending.value)
function use() {
  // A title is one line.
  const words = props.kind === 'title' ? text.value.replace(/\s+/g, ' ') : text.value
  emit('use', {
    text: words.trim(),
    offered: picked.value?.offered ?? null,
    aim: picked.value?.aim ?? null,
  })
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
      @click.self="!generate.isPending.value && emit('cancel')"
    >
      <div
        ref="dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        class="panel max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6"
      >
        <h2 :id="titleId" class="mb-2 font-display text-xl font-semibold">
          {{ kind === 'title' ? 'Rephrase the title' : 'Rephrase this passage' }}
        </h2>
        <p class="mb-4 text-sm text-ink-soft">
          Say what you want these words to do and ask for options. They are different ways you might
          put it, to react to: choose one, change it, and use it only if it is better than yours.
          Your draft, these words and your aim are sent to your AI provider.
        </p>

        <label for="rephrase-wording" class="mb-1 block text-sm font-medium">Current wording</label>
        <textarea
          id="rephrase-wording"
          v-model="text"
          class="field mb-1 w-full"
          :rows="kind === 'title' ? 2 : 5"
        ></textarea>
        <p
          v-if="wordingIssue"
          :id="blocker === wordingIssue ? hintId : undefined"
          class="mb-3 text-sm text-danger"
        >
          {{ wordingIssue }}
        </p>
        <p v-if="mixedFormatting" class="mb-3 text-sm text-ink-soft">
          Some of these words are bold, italic or linked, and others aren't. Using new wording will
          make them all plain.
        </p>

        <label for="rephrase-aim" class="mt-3 mb-1 block text-sm font-medium">
          What should it do?
        </label>
        <textarea
          id="rephrase-aim"
          ref="aimField"
          v-model="aim"
          class="field mb-3 w-full"
          rows="2"
          placeholder="For example: plainer, for someone new to the subject"
        ></textarea>

        <div class="mb-2 flex flex-wrap items-center gap-3">
          <AiButton
            class="btn btn-outline"
            :busy="generate.isPending.value"
            busy-text="Looking for options…"
            :disabled="!!blocker"
            :aria-describedby="blocker ? hintId : undefined"
            @click="generate.mutate()"
          >
            Generate options
          </AiButton>
          <p class="text-sm text-ink-soft">
            {{
              asked.length
                ? `Round ${asked.length} of ${limit}`
                : `${limit} ${limit === 1 ? 'round' : 'rounds'} of options here`
            }}
          </p>
        </div>
        <p
          v-if="blocker && blocker !== wordingIssue"
          :id="hintId"
          class="mb-3 text-sm text-ink-soft"
        >
          {{ blocker }}
        </p>
        <p v-if="generate.isError.value" role="alert" class="mb-3 text-danger">
          {{ errorMessage(generate.error.value) }}
        </p>
        <p class="sr-only" aria-live="polite">{{ announcement }}</p>

        <div v-if="result" class="mb-4">
          <h3 class="mb-2 text-sm font-medium">Options for “{{ asked.at(-1)?.aim }}”</h3>
          <RephraseOptions :size="result.size" :options="result.options" @pick="pick" />
        </div>

        <div class="mt-5 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            class="btn btn-neutral"
            :disabled="generate.isPending.value"
            @click="emit('cancel')"
          >
            Cancel
          </button>
          <button type="button" class="btn btn-primary" :disabled="!canUse" @click="use">
            Use this
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
