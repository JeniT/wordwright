<script setup lang="ts">
import type { Publication } from '@wordwright/core'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { api, errorMessage } from '../lib/api'
import { displayHost } from '../lib/usePublications'
import { useSessionStore } from '../stores/session'
import ConfirmDialog from './ConfirmDialog.vue'
import DangerZone from './DangerZone.vue'
import ExportSection from './ExportSection.vue'
import HoldButton from './HoldButton.vue'
import Icon from './Icon.vue'
import ImageField from './ImageField.vue'
import PublicationDescriptionSection from './PublicationDescriptionSection.vue'
import PublicationImage from './PublicationImage.vue'
import PublicationPeople from './PublicationPeople.vue'
import PublicationInvitations from './PublicationInvitations.vue'
import TextField from './TextField.vue'
import SaveStatus from './SaveStatus.vue'

/** Mount with a key per publication: the form starts from the publication as it is on arrival. */
const props = defineProps<{ publication: Publication }>()
/** Saving a new name moved the publication to a new id (sent just before the address changes). */
const emit = defineEmits<{ renamed: [id: string] }>()
const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const refresh = () => queryClient.invalidateQueries({ queryKey: ['publications'] })
// Computed because stepping down changes it while this page is open.
const isOwner = computed(() => props.publication.role === 'owner')

// ---- details
const name = ref(props.publication.name)
const siteUrl = ref(props.publication.siteUrl ?? '')
const saveDetails = useMutation({
  mutationFn: () =>
    api.updatePublication(props.publication.id, {
      name: name.value,
      siteUrl: siteUrl.value.trim() || null,
    }),
  onSuccess: async (saved) => {
    siteUrl.value = saved.siteUrl ?? '' // shows the address as stored, e.g. with https:// added
    if (saved.id !== props.publication.id) {
      // The new name gave the publication a new address. Until the page has moved there, the list
      // must know both ids, or this page would briefly look for a publication that isn't there.
      // The refresh below replaces the list with the server's, which has only the new one.
      queryClient.setQueryData<Publication[]>(['publications'], (list) =>
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

// ---- deletion
const confirmingDelete = ref(false)
const deletePublication = useMutation({
  mutationFn: () => api.deletePublication(props.publication.id),
  onSuccess: async () => {
    queryClient.removeQueries({ queryKey: ['drafts'] })
    await refresh()
    await router.push('/')
  },
  onSettled: () => (confirmingDelete.value = false),
})
</script>

<template>
  <div class="max-w-xl space-y-10">
    <header>
      <p class="mb-2 text-sm">
        <RouterLink
          :to="{ name: 'publication', params: { publicationId: publication.id } }"
          class="underline"
        >
          ← {{ publication.name }}
        </RouterLink>
      </p>
      <h1 class="font-display text-2xl font-semibold">Publication settings</h1>
      <p class="mt-1 text-sm text-ink-soft">
        Address: <code class="rounded-ctl bg-sunken px-1">/p/{{ publication.id }}</code>
      </p>
    </header>

    <section aria-labelledby="details-heading">
      <h2 id="details-heading" class="mb-3 font-display text-xl font-semibold">Details</h2>
      <form v-if="isOwner" @submit.prevent="saveDetails.mutate()">
        <TextField v-model="name" label="Name" required autocomplete="off" />
        <TextField
          v-model="siteUrl"
          label="Website"
          autocomplete="off"
          hint="Where it gets published, for example https://yourname.substack.com. Leave empty for none."
        />
        <div class="flex flex-wrap items-center gap-3">
          <button type="submit" class="btn btn-primary" :disabled="saveDetails.isPending.value">
            {{ saveDetails.isPending.value ? 'Saving…' : 'Save details' }}
          </button>
          <SaveStatus :mutation="saveDetails" class="basis-full" />
        </div>
      </form>
      <dl v-else class="text-sm">
        <dt class="font-medium">Name</dt>
        <dd class="mb-2">{{ publication.name }}</dd>
        <dt class="font-medium">Website</dt>
        <dd>{{ publication.siteUrl ? displayHost(publication.siteUrl) : 'None' }}</dd>
      </dl>
    </section>

    <PublicationDescriptionSection :publication="publication" />

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

    <section aria-labelledby="sharing-heading">
      <h2 id="sharing-heading" class="mb-3 font-display text-xl font-semibold">Sharing</h2>
      <PublicationPeople :publication="publication" />
      <PublicationInvitations
        v-if="isOwner"
        :publication-id="publication.id"
        :publication-name="publication.name"
        :confirmed="session.user?.emailVerified ?? false"
      />
    </section>

    <ExportSection :publication="{ id: publication.id, role: publication.role }" />

    <DangerZone
      v-if="isOwner"
      title="Delete publication"
      :error="
        deletePublication.isError.value ? errorMessage(deletePublication.error.value) : undefined
      "
    >
      <p class="mb-3 text-sm">
        This permanently deletes the publication and all its drafts, for everyone it's shared with.
      </p>
      <template #action>
        <button type="button" class="btn btn-danger-solid" @click="confirmingDelete = true">
          Delete this publication
        </button>
      </template>
    </DangerZone>

    <ConfirmDialog
      :open="confirmingDelete"
      title="Delete this publication?"
      confirm-label="Yes, delete it"
      busy-label="Deleting…"
      :busy="deletePublication.isPending.value"
      @confirm="deletePublication.mutate()"
      @cancel="confirmingDelete = false"
    >
      “{{ publication.name }}” and all its drafts will be deleted for everyone who shares it. This
      can't be undone.
    </ConfirmDialog>
  </div>
</template>
