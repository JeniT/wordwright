<script setup lang="ts">
import { useTheme, type ThemeChoice } from '../lib/useTheme'

/**
 * Appearance: follow the device, or always light, or always dark. Three states, so a radio group (arrow keys move
 * between them), not a switch. Applies and saves as soon as it is chosen.
 */
withDefaults(defineProps<{ label?: string }>(), { label: 'Appearance' })
const { choice, choose } = useTheme()
const options: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]
</script>

<template>
  <div role="radiogroup" :aria-label="label" class="segmented">
    <label v-for="option in options" :key="option.value">
      <input
        type="radio"
        name="appearance"
        :value="option.value"
        :checked="choice === option.value"
        @change="choose(option.value)"
      />
      <span>{{ option.label }}</span>
    </label>
  </div>
</template>
