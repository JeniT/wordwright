<script setup lang="ts">
import { computed } from 'vue'
import PasswordSection from '../components/PasswordSection.vue'
import DevicesSection from '../components/DevicesSection.vue'
import InvitationBlocksSection from '../components/InvitationBlocksSection.vue'
import StepHeading from '../components/StepHeading.vue'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const capitalised = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)
/** "You sign in with email", "...with Google", or both. */
const method = computed(() => {
  const user = session.user
  if (!user) return ''
  const ways = [...(user.hasPassword ? ['email'] : []), ...user.linkedProviders.map(capitalised)]
  return ways.length ? `You sign in with ${ways.join(' or ')}` : ''
})
</script>

<template>
  <div>
    <StepHeading>Sign-in and security</StepHeading>
    <p v-if="method" class="mb-8 text-ink-soft">{{ method }}</p>
    <div class="space-y-10">
      <PasswordSection />
      <DevicesSection />
      <InvitationBlocksSection />
    </div>
  </div>
</template>
