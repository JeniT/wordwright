<script setup lang="ts">
import { computed } from 'vue'
import { diffLines, foldUnchanged } from '../lib/diff'

const props = defineProps<{ before: string; after: string }>()
const rows = computed(() => foldUnchanged(diffLines(props.before, props.after)))
</script>

<template>
  <!-- Colour is never the only signal: each line says (to everyone) whether it is added or removed. -->
  <div class="overflow-x-auto rounded border border-stone-200 bg-white text-sm">
    <template v-for="(row, i) in rows" :key="i">
      <p v-if="row.kind === 'skipped'" class="px-3 py-1 text-stone-600">
        … {{ row.count }} unchanged {{ row.count === 1 ? 'line' : 'lines' }} …
      </p>
      <p
        v-else
        class="whitespace-pre-wrap px-3 py-0.5"
        :class="{
          'bg-green-50 text-green-900': row.kind === 'added',
          'bg-red-50 text-red-900 line-through decoration-red-300': row.kind === 'removed',
        }"
      >
        <span v-if="row.kind === 'added'" class="font-semibold"
          >+<span class="sr-only"> Added:</span>
        </span>
        <span v-else-if="row.kind === 'removed'" class="font-semibold no-underline"
          >−<span class="sr-only"> Removed:</span>
        </span>
        <span v-else class="mr-1 inline-block w-2"></span>{{ row.text || ' ' }}
      </p>
    </template>
  </div>
</template>
