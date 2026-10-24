<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useTutorialMode, useUpdateTutorial } from '../lib/tutorial'
import { vTip } from '../lib/tip'
import SwitchField from './SwitchField.vue'

/**
 * The Tutorial switch in the menu's account area (#314). It flips at once and saves in the background. If saving fails
 * it goes back to the saved setting and stays unavailable until the page is reloaded (held here, not in storage), with
 * its tooltip saying why, so there is no alert to dismiss. See "Tutorial mode" in docs/design/explanatory-text.md.
 */
const ON_TIP = 'Shows explanations on each page. Turn off once you know your way round.'
const BROKEN_TIP = 'Sorry, we couldn’t save that. Please reload the page to try again.'

const on = useTutorialMode()
const save = useUpdateTutorial()
const broken = ref(false)
const tipId = useId()
const tip = computed(() => (broken.value ? BROKEN_TIP : ON_TIP))

function change(value: boolean) {
  save.mutate({ on: value }, { onError: () => (broken.value = true) })
}
</script>

<template>
  <SwitchField
    v-tip="tip"
    compact
    label="Tutorial"
    :model-value="on"
    :unavailable="broken"
    :described-by="tipId"
    @update:model-value="change"
  />
  <span :id="tipId" class="sr-only">{{ tip }}</span>
</template>
