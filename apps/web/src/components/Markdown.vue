<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../lib/markdown'

const props = defineProps<{ text: string }>()
// Safe to insert as HTML: renderMarkdown escapes any HTML in the text and keeps only safe links (see lib/markdown.ts).
const html = computed(() => renderMarkdown(props.text))
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="markdown" v-html="html"></div>
</template>
