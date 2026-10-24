<script setup lang="ts">
import NextStep from '../components/NextStep.vue'
import { ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import PublicationDetailsSection from '../components/PublicationDetailsSection.vue'
import PublicationGate from '../components/PublicationGate.vue'
import StepHeading from '../components/StepHeading.vue'
import { usePublication } from '../lib/usePublications'

const props = defineProps<{ publicationId: string }>()
const router = useRouter()
const { publication } = usePublication(() => props.publicationId)

// Only owners can change these, so a member who types the address is sent to the first page that is theirs.
watchEffect(() => {
  if (publication.value && publication.value.role !== 'owner')
    void router.replace({
      name: 'publication-settings-description',
      params: { publicationId: props.publicationId },
    })
})

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
  <PublicationGate v-slot="{ publication: current }" :publication-id="publicationId">
    <div v-if="current.role === 'owner'" class="max-w-xl">
      <StepHeading>Details</StepHeading>
      <PublicationDetailsSection
        :key="formKey"
        :publication="current"
        @renamed="renamedTo = $event"
      />
      <NextStep />
    </div>
  </PublicationGate>
</template>
