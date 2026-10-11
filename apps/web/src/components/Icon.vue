<script setup lang="ts">
/**
 * The few icons the app uses, drawn inline so there is no dependency. They are decoration: the button that holds one
 * always has a name of its own (an aria-label), and an icon-only button says what it does in a tooltip too.
 */
defineProps<{ name: 'edit' | 'remove' | 'up' | 'down'; size?: number }>()
</script>

<template>
  <svg
    aria-hidden="true"
    focusable="false"
    :width="size ?? 18"
    :height="size ?? 18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <template v-if="name === 'edit'">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </template>
    <template v-else-if="name === 'remove'">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <path d="M10 11v6M14 11v6" />
    </template>
    <path v-else-if="name === 'up'" d="m18 15-6-6-6 6" />
    <path v-else d="m6 9 6 6 6-6" />
  </svg>
</template>
