<script setup lang="ts">
import InfoTip from './InfoTip.vue'
import ThemeChoice from './ThemeChoice.vue'
</script>

<template>
  <section aria-labelledby="appearance-heading">
    <div class="mb-3 flex items-center gap-2">
      <h2 id="appearance-heading" class="font-display text-xl font-semibold">Appearance</h2>
      <InfoTip label="About appearance">Applies on this device.</InfoTip>
    </div>
    <ThemeChoice />
  </section>
</template>
