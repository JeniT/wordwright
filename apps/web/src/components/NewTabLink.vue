<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { computed } from 'vue'
import { vTip } from '../lib/tip'
import Icon from './Icon.vue'

/**
 * A link that opens in a new tab. The icon says so to the eye; the hidden words say so to a screen reader, so the
 * wording lives here and nowhere else (docs/design/explanatory-text.md). `detail` adds to the spoken name (for example the page's title)
 * when the visible words, such as "Open the page", would not tell a list of them apart.
 */
const props = defineProps<{ href?: string; to?: string; detail?: string }>()
const inApp = computed(() => props.to !== undefined)
// Starts after a real space in the template: a space at the start of the hidden span is dropped from the spoken name.
const hiddenText = () => (props.detail ? `${props.detail} ` : '') + '(opens in a new tab)'
</script>

<template>
  <component
    :is="inApp ? RouterLink : 'a'"
    v-bind="inApp ? { to: props.to } : { href: props.href }"
    v-tip="'Opens in a new tab'"
    target="_blank"
    rel="noopener noreferrer"
    ><slot />{{ ' ' }}<span class="sr-only">{{ hiddenText() }}</span
    ><Icon name="external" :size="14" class="inline align-[-0.1em]"
  /></component>
</template>
