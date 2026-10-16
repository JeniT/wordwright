<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useTutorialMode, useUpdateTutorial } from '../lib/tutorial'
import SaveStatus from './SaveStatus.vue'
import SwitchField from './SwitchField.vue'

const on = useTutorialMode()
const field = useTemplateRef<InstanceType<typeof SwitchField>>('field')
const save = useUpdateTutorial()
// Shown as soon as it is flipped; if saving fails, the switch goes back.
watch(save.isError, (failed) => failed && field.value?.revert())
</script>

<template>
  <section aria-labelledby="tutorial-heading">
    <h2 id="tutorial-heading" class="mb-1 font-display text-xl font-semibold">Tutorial mode</h2>
    <p class="mb-3 text-sm text-ink-soft">
      Explains each page as you go.
      <RouterLink :to="{ name: 'help-tutorial-mode' }" class="link">About tutorial mode</RouterLink>
    </p>
    <SwitchField
      ref="field"
      :model-value="on"
      label="Tutorial mode"
      @update:model-value="save.mutate({ on: $event })"
    />
    <SaveStatus :mutation="save" class="mt-2" />
  </section>
</template>
