<script setup lang="ts">
import type { Profile } from '@lfwa/core'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { api, errorMessage } from '../lib/api'
import { displayHost } from '../lib/useProfiles'
import { useSessionStore } from '../stores/session'
import ConfirmDialog from './ConfirmDialog.vue'
import DangerZone from './DangerZone.vue'
import ExportSection from './ExportSection.vue'
import HoldButton from './HoldButton.vue'
import Icon from './Icon.vue'
import ImageField from './ImageField.vue'
import ProfileDescriptionSection from './ProfileDescriptionSection.vue'
import ProfileImage from './ProfileImage.vue'
import ProfilePeople from './ProfilePeople.vue'
import ProfileInvitations from './ProfileInvitations.vue'
import TextField from './TextField.vue'
import SaveStatus from './SaveStatus.vue'

/** Mount with a key per profile: the form starts from the profile as it is on arrival. */
const props = defineProps<{ profile: Profile }>()
/** Saving a new name moved the profile to a new id (sent just before the address changes). */
const emit = defineEmits<{ renamed: [id: string] }>()
const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const refresh = () => queryClient.invalidateQueries({ queryKey: ['profiles'] })
// Computed because stepping down changes it while this page is open.
const isOwner = computed(() => props.profile.role === 'owner')

// ---- details
const name = ref(props.profile.name)
const siteUrl = ref(props.profile.siteUrl ?? '')
const saveDetails = useMutation({
  mutationFn: () =>
    api.updateProfile(props.profile.id, {
      name: name.value,
      siteUrl: siteUrl.value.trim() || null,
    }),
  onSuccess: async (saved) => {
    siteUrl.value = saved.siteUrl ?? '' // shows the address as stored, e.g. with https:// added
    if (saved.id !== props.profile.id) {
      // The new name gave the profile a new address. Until the page has moved there, the list
      // must know both ids, or this page would briefly look for a profile that isn't there.
      // The refresh below replaces the list with the server's, which has only the new one.
      queryClient.setQueryData<Profile[]>(['profiles'], (list) =>
        list?.flatMap((p) => (p.id === props.profile.id ? [p, saved] : [p])),
      )
      emit('renamed', saved.id)
      await router.replace({ name: route.name, params: { ...route.params, profileId: saved.id } })
    }
    return refresh()
  },
})

// ---- picture
const uploadImage = useMutation({
  mutationFn: (file: File) => api.setProfileImage(props.profile.id, file),
  onSuccess: refresh,
})
const removeImage = useMutation({
  mutationFn: () => api.removeProfileImage(props.profile.id),
  onSuccess: refresh,
})

// ---- deletion
const confirmingDelete = ref(false)
const deleteProfile = useMutation({
  mutationFn: () => api.deleteProfile(props.profile.id),
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
        <RouterLink :to="{ name: 'profile', params: { profileId: profile.id } }" class="underline">
          ← {{ profile.name }}
        </RouterLink>
      </p>
      <h1 class="font-display text-2xl font-semibold">Profile settings</h1>
      <p class="mt-1 text-sm text-ink-soft">
        Address: <code class="rounded-ctl bg-sunken px-1">/p/{{ profile.id }}</code>
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
        <dd class="mb-2">{{ profile.name }}</dd>
        <dt class="font-medium">Website</dt>
        <dd>{{ profile.siteUrl ? displayHost(profile.siteUrl) : 'None' }}</dd>
      </dl>
    </section>

    <ProfileDescriptionSection :profile="profile" />

    <section aria-labelledby="picture-heading">
      <h2 id="picture-heading" class="mb-3 font-display text-xl font-semibold">Picture</h2>
      <div class="flex items-center gap-4">
        <ProfileImage
          :id="profile.id"
          :name="profile.name"
          :image-url="profile.imageUrl"
          size="lg"
        />
        <div v-if="isOwner" class="flex-1">
          <ImageField label="Choose a picture" @select="uploadImage.mutate($event)" />
          <HoldButton
            v-if="profile.imageUrl"
            verb="Remove"
            class="btn btn-sm btn-icon btn-quiet hover:border-danger hover:bg-danger-wash hover:text-danger"
            title="Press and hold, or tap twice, to remove the picture"
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
      <ProfilePeople :profile="profile" />
      <ProfileInvitations
        v-if="isOwner"
        :profile-id="profile.id"
        :profile-name="profile.name"
        :confirmed="session.user?.emailVerified ?? false"
      />
    </section>

    <ExportSection :profile="{ id: profile.id, role: profile.role }" />

    <DangerZone
      v-if="isOwner"
      title="Delete profile"
      :error="deleteProfile.isError.value ? errorMessage(deleteProfile.error.value) : undefined"
    >
      <p class="mb-3 text-sm">
        This permanently deletes the profile and all its drafts, for everyone it's shared with.
      </p>
      <template #action>
        <button type="button" class="btn btn-danger-solid" @click="confirmingDelete = true">
          Delete this profile
        </button>
      </template>
    </DangerZone>

    <ConfirmDialog
      :open="confirmingDelete"
      title="Delete this profile?"
      confirm-label="Yes, delete it"
      busy-label="Deleting…"
      :busy="deleteProfile.isPending.value"
      @confirm="deleteProfile.mutate()"
      @cancel="confirmingDelete = false"
    >
      “{{ profile.name }}” and all its drafts will be deleted for everyone who shares it. This can't
      be undone.
    </ConfirmDialog>
  </div>
</template>
