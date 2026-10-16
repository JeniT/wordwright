<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { computed, useAttrs, useId } from 'vue'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queries'
import { aiHint } from '../lib/ai'
import Icon from './Icon.vue'

/**
 * Every button that sends something to the writer's AI (and so spends tokens on their own key) is this one: the
 * button's own `btn` classes, an AI icon beside the label, and a spinner in the icon's place while it works. The
 * label never changes, so the button keeps its width. The icon is explained in words as a tooltip and as the
 * button's description; while busy the button is disabled, `aria-busy`, and `busyText` is read out. Under reduced
 * motion the mark stays still. Buttons that make no AI call never use this. See docs/design.md.
 */
defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{ busy?: boolean; busyText?: string; disabled?: boolean }>(),
  { busy: false, busyText: 'Working…', disabled: false },
)
const attrs = useAttrs()
const hintId = useId()
const llm = useQuery({ queryKey: queryKeys.llm(), queryFn: () => api.getLlmSettings() })
const hint = computed(() => aiHint(llm.data.value?.provider))
const describedBy = computed(() => [attrs['aria-describedby'], hintId].filter(Boolean).join(' '))
</script>

<template>
  <button
    type="button"
    v-bind="attrs"
    :disabled="props.disabled || props.busy"
    :aria-busy="props.busy"
    :aria-describedby="describedBy"
    :title="hint"
  >
    <Icon v-if="props.busy" name="working" class="motion-safe:animate-spin" />
    <Icon v-else name="ai" />
    <slot />
  </button>
  <span :id="hintId" class="sr-only">{{ hint }}</span>
  <span aria-live="polite" class="sr-only">{{ props.busy ? props.busyText : '' }}</span>
</template>
