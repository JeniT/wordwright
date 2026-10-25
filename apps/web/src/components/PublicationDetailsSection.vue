<script setup lang="ts">
import type { Publication } from '@wordwright/core'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSiteIconPreview } from '../lib/site-icon-preview'
import { api, errorMessage } from '../lib/api'
import { invalidateRoots, queryKeys } from '../lib/queries'
import { displayHost } from '../lib/usePublications'
import HoldButton from './HoldButton.vue'
import Icon from './Icon.vue'
import ImageField from './ImageField.vue'
import PublicationDetailsFields from './PublicationDetailsFields.vue'
import PublicationImage from './PublicationImage.vue'
import SaveStatus from './SaveStatus.vue'

/** Mount with a key per publication: the form starts from the publication as it is on arrival. */
const props = defineProps<{ publication: Publication }>()
/** Saving a new name moved the publication to a new id (sent just before the address changes). */
const emit = defineEmits<{ renamed: [id: string] }>()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const refresh = () => invalidateRoots(queryClient, 'publications')
// Computed because stepping down changes it while this page is open.
const isOwner = computed(() => props.publication.role === 'owner')

// ---- details
const name = ref(props.publication.name)
const siteUrl = ref(props.publication.siteUrl ?? '')
const siteIcon = useSiteIconPreview()
// Saved is only true while the fields match the publication as stored.
const detailsUnsaved = computed(
  () =>
    name.value !== props.publication.name ||
    siteUrl.value.trim() !== (props.publication.siteUrl ?? ''),
)
const saveDetails = useMutation({
  mutationFn: () =>
    api.updatePublication(props.publication.id, {
      name: name.value,
      siteUrl: siteUrl.value.trim() || null,
    }),
  onSuccess: async (saved) => {
    siteIcon.look('') // the saved icon is shown in Picture now
    siteUrl.value = saved.siteUrl ?? '' // shows the address as stored, e.g. with https:// added
    if (saved.id !== props.publication.id) {
      // The new name gave the publication a new address. Until the page has moved there, the list
      // must know both ids, or this page would briefly look for a publication that isn't there.
      // The refresh below replaces the list with the server's, which has only the new one.
      queryClient.setQueryData<Publication[]>(queryKeys.publications(), (list) =>
        list?.flatMap((p) => (p.id === props.publication.id ? [p, saved] : [p])),
      )
      emit('renamed', saved.id)
      await router.replace({
        name: route.name,
        params: { ...route.params, publicationId: saved.id },
      })
    }
    return refresh()
  },
})

// ---- picture
const uploadImage = useMutation({
  mutationFn: (file: File) => api.setPublicationImage(props.publication.id, file),
  onSuccess: refresh,
})
const removeImage = useMutation({
  mutationFn: () => api.removePublicationImage(props.publication.id),
  onSuccess: refresh,
})
</script>

<template>
  <div class="space-y-10">
    <section aria-labelledby="details-heading">
      <h2 id="details-heading" class="sr-only">Name and website</h2>
      <form v-if="isOwner" @submit.prevent="saveDetails.mutate()">
        <PublicationDetailsFields
          v-model:name="name"
          v-model:site-url="siteUrl"
          :site-icon="siteIcon"
          :existing="publication"
        />
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="saveDetails.isPending.value || !detailsUnsaved"
          >
            {{ saveDetails.isPending.value ? 'Saving…' : 'Save details' }}
          </button>
          <SaveStatus :mutation="saveDetails" :unsaved="detailsUnsaved" class="basis-full" />
        </div>
      </form>
      <dl v-else class="text-sm">
        <dt class="font-medium">Name</dt>
        <dd class="mb-2">{{ publication.name }}</dd>
        <dt class="font-medium">Website</dt>
        <dd>{{ publication.siteUrl ? displayHost(publication.siteUrl) : 'None' }}</dd>
      </dl>
    </section>

    <section aria-labelledby="picture-heading">
      <h2 id="picture-heading" class="mb-3 font-display text-xl font-semibold">Picture</h2>
      <div class="flex items-center gap-4">
        <PublicationImage
          :id="publication.id"
          :name="publication.name"
          :image-url="publication.imageUrl"
          :site-icon-url="publication.siteIconUrl"
          :site-icon-square="publication.siteIconSquare"
          size="lg"
        />
        <div v-if="isOwner" class="flex-1">
          <ImageField label="Choose a picture" @select="uploadImage.mutate($event)" />
          <HoldButton
            v-if="publication.imageUrl"
            tip="Press and hold, or tap twice, to remove the picture"
            verb="Remove"
            class="btn btn-sm btn-icon btn-ghost btn-ghost-danger"
            aria-label="Remove picture"
            :disabled="removeImage.isPending.value"
            @confirm="removeImage.mutate()"
          >
            <Icon name="remove" />
          </HoldButton>
        </div>
      </div>
      <p v-if="uploadImage.isPending.value" role="status" class="mt-2 text-sm">Uploading…</p>
      <p v-if="uploadImage.isError.value" role="alert" class="mt-2 text-danger">
        {{ errorMessage(uploadImage.error.value) }}
      </p>
      <p v-if="removeImage.isError.value" role="alert" class="mt-2 text-danger">
        {{ errorMessage(removeImage.error.value) }}
      </p>
    </section>
  </div>
</template>
