<script setup lang="ts">
import { useId } from 'vue'

defineProps<{
  label: string
  hint?: string
  rows?: number
  maxlength?: number
}>()
const model = defineModel<string>({ required: true })
const id = useId()
</script>

<template>
  <div class="mb-4">
    <label :for="id" class="mb-1 block text-sm font-medium">{{ label }}</label>
    <textarea
      :id="id"
      v-model="model"
      :rows="rows ?? 6"
      :maxlength="maxlength"
      :aria-describedby="hint ? `${id}-hint` : undefined"
      class="w-full rounded border border-stone-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent"
    />
    <p v-if="hint" :id="`${id}-hint`" class="mt-1 text-sm text-stone-600">{{ hint }}</p>
  </div>
</template>
