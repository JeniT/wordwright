<script setup lang="ts">
import { RouterLink } from 'vue-router'
import Icon from './Icon.vue'

/**
 * A link that opens in a new tab. The icon says so to the eye; the hidden words say so to a screen reader, so the
 * wording lives here and nowhere else (docs/design.md). `detail` adds to the spoken name (for example the page's title)
 * when the visible words, such as "Open the page", would not tell a list of them apart.
 */
const props = defineProps<{ href?: string; to?: string; detail?: string }>()
// Starts after a real space in the template: a space at the start of the hidden span is dropped from the spoken name.
const spoken = () => (props.detail ? `${props.detail} ` : '') + '(opens in a new tab)'
</script>

<template>
  <component
    :is="props.to !== undefined ? RouterLink : 'a'"
    v-bind="props.to !== undefined ? { to: props.to } : { href: props.href }"
    target="_blank"
    rel="noopener noreferrer"
    title="Opens in a new tab"
    ><slot />{{ ' ' }}<span class="sr-only">{{ spoken() }}</span
    ><Icon name="external" :size="14" class="inline align-[-0.1em]"
  /></component>
</template>
