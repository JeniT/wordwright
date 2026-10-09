<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <section class="mx-auto max-w-sm rounded border border-stone-200 bg-white p-6">
    <h1 class="mb-4 font-serif text-2xl font-semibold">{{ title }}</h1>
    <slot />
  </section>
</template>
