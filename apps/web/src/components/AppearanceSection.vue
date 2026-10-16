<script setup lang="ts">
import InfoTip from './InfoTip.vue'
import ThemeChoice from './ThemeChoice.vue'

const legend = 'Light mode, dark mode, or follow your device'
</script>

<template>
  <section aria-labelledby="appearance-heading">
    <h2 id="appearance-heading" class="mb-3 font-display text-xl font-semibold">Appearance</h2>
    <div class="mb-2 flex items-center gap-2">
      <p class="text-sm font-medium">{{ legend }}</p>
      <InfoTip label="About appearance">Applies on this device.</InfoTip>
    </div>
    <ThemeChoice :label="legend" />
  </section>
</template>
