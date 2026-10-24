<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import { cameFrom } from '../router'

/**
 * The frame of a help page: a way back, then the title. "Back" returns to where the person was (the screen that
 * linked here); when they came straight to the page (a new tab, a reload, an email) there is no such place, so the link goes
 * to the list of help pages instead. The list and the not-found page have no Back link. docs/design/explanatory-text.md ("On a help page") has the rules.
 */
const props = defineProps<{ title: string; hideBack?: boolean }>()
const router = useRouter()
</script>

<template>
  <div>
    <p v-if="!props.hideBack" class="mb-4 text-sm">
      <a v-if="cameFrom" :href="cameFrom" class="link" @click.prevent="router.back()">← Back</a>
      <RouterLink v-else :to="{ name: 'help' }" class="link">← All help</RouterLink>
    </p>
    <h1 class="h1 mb-6 break-words">{{ props.title }}</h1>
    <slot />
  </div>
</template>
