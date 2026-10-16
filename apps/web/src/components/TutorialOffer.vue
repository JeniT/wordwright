<script setup lang="ts">
import { errorMessage } from '../lib/api'
import { useTutorialOffer, useUpdateTutorial } from '../lib/tutorial'

/** The one-time offer to turn tutorial mode off, once every page with tutorial text has been seen (#198). */
const show = useTutorialOffer()
const answer = useUpdateTutorial()
</script>

<template>
  <section v-if="show" class="notice notice-info" aria-labelledby="tutorial-offer-heading">
    <h2 id="tutorial-offer-heading" class="font-semibold">You’ve seen every kind of page</h2>
    <p class="mt-1 text-ink-soft">
      Tutorial mode explains each page as you go. You can turn it off now, or on again later in your
      account settings.
    </p>
    <div class="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="btn btn-primary btn-sm"
        :disabled="answer.isPending.value"
        @click="answer.mutate({ on: false, answered: true })"
      >
        Turn off tutorial mode
      </button>
      <button
        type="button"
        class="btn btn-quiet btn-sm"
        :disabled="answer.isPending.value"
        @click="answer.mutate({ answered: true })"
      >
        Keep it on
      </button>
    </div>
    <p v-if="answer.isError.value" role="alert" class="mt-2 text-danger">
      {{ errorMessage(answer.error.value) }}
    </p>
  </section>
</template>
