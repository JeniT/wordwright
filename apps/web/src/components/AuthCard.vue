<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <section class="mx-auto max-w-sm panel p-6">
    <h1 class="mb-4 font-display text-2xl font-semibold">{{ title }}</h1>
    <slot />
  </section>
</template>
