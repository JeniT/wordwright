<script setup lang="ts">
import { ref, watch } from 'vue'
import PublicationSettingsPanel from '../components/PublicationSettingsPanel.vue'
import PublicationGate from '../components/PublicationGate.vue'

const props = defineProps<{ publicationId: string }>()

// The panel starts afresh for each publication, but not when saving a new name moves this publication to a
// new address: that would throw away the "Saved" notice.
const panelKey = ref(props.publicationId)
const renamedTo = ref('')
watch(
  () => props.publicationId,
  (id) => {
    if (id !== renamedTo.value) panelKey.value = id
  },
)
</script>

<template>
  <PublicationGate v-slot="{ publication }" :publication-id="publicationId">
    <PublicationSettingsPanel
      :key="panelKey"
      :publication="publication"
      @renamed="renamedTo = $event"
    />
  </PublicationGate>
</template>
