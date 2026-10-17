<script setup lang="ts">
import { ref, watch } from 'vue'
import PublicationDetailsSection from '../components/PublicationDetailsSection.vue'
import PublicationGate from '../components/PublicationGate.vue'
import StepHeading from '../components/StepHeading.vue'

const props = defineProps<{ publicationId: string }>()

// The form starts afresh for each publication, but not when saving a new name moves this publication to a
// new address: that would throw away the "Saved" notice.
const formKey = ref(props.publicationId)
const renamedTo = ref('')
watch(
  () => props.publicationId,
  (id) => {
    if (id !== renamedTo.value) formKey.value = id
  },
)
</script>

<template>
  <PublicationGate v-slot="{ publication }" :publication-id="publicationId">
    <div class="max-w-xl">
      <StepHeading>Details</StepHeading>
      <PublicationDetailsSection
        :key="formKey"
        :publication="publication"
        @renamed="renamedTo = $event"
      />
    </div>
  </PublicationGate>
</template>
