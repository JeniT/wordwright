<script setup lang="ts">
import { watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { useProfiles } from '../lib/useProfiles'

const router = useRouter()
const profiles = useProfiles()

watchEffect(() => {
  if (!profiles.data.value) return
  const first = profiles.data.value[0]
  router.replace(first ? { name: 'drafts', params: { profileId: first.id } } : { name: 'account' })
})
</script>

<template>
  <p v-if="profiles.isError.value" role="alert" class="text-red-700">
    Couldn't load your profiles.
  </p>
  <p v-else>Loading…</p>
</template>
