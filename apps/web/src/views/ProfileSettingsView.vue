<script setup lang="ts">
import { ref, watch } from 'vue'
import ProfileSettingsPanel from '../components/ProfileSettingsPanel.vue'
import ProfileGate from '../components/ProfileGate.vue'

const props = defineProps<{ profileId: string }>()

// The panel starts afresh for each profile, but not when saving a new name moves this profile to a
// new address: that would throw away the "Saved" notice.
const panelKey = ref(props.profileId)
const renamedTo = ref('')
watch(
  () => props.profileId,
  (id) => {
    if (id !== renamedTo.value) panelKey.value = id
  },
)
</script>

<template>
  <ProfileGate v-slot="{ profile }" :profile-id="profileId">
    <ProfileSettingsPanel :key="panelKey" :profile="profile" @renamed="renamedTo = $event" />
  </ProfileGate>
</template>
