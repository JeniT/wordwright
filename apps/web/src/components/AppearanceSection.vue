<script setup lang="ts">
import ThemeChoice from './ThemeChoice.vue'
</script>

<template>
  <section aria-labelledby="appearance-heading">
    <h2 id="appearance-heading" class="mb-1 font-display text-xl font-semibold">Appearance</h2>
    <p class="mb-3 text-sm text-ink-soft">
      Follow your device’s light or dark setting, or always use one. It applies on this device
      straight away.
    </p>
    <ThemeChoice />
  </section>
</template>
