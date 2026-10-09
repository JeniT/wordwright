<script setup lang="ts">
import type { Profile } from '@lfwa/core'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { api, errorMessage } from '../lib/api'
import { displayHost } from '../lib/useProfiles'
import { useSessionStore } from '../stores/session'
import ImageField from './ImageField.vue'
import ProfileImage from './ProfileImage.vue'
import ProfileInvitations from './ProfileInvitations.vue'
import TextField from './TextField.vue'

/** Mount with `:key="profile.id"`: the form starts from the profile as it is on arrival. */
const props = defineProps<{ profile: Profile }>()
const session = useSessionStore()
const router = useRouter()
const queryClient = useQueryClient()
const refresh = () => queryClient.invalidateQueries({ queryKey: ['profiles'] })
const isOwner = props.profile.role === 'owner'

// ---- details
const name = ref(props.profile.name)
const siteUrl = ref(props.profile.siteUrl ?? '')
const saveDetails = useMutation({
  mutationFn: () =>
    api.updateProfile(props.profile.id, {
      name: name.value,
      siteUrl: siteUrl.value.trim() || null,
    }),
  onSuccess: (saved) => {
    siteUrl.value = saved.siteUrl ?? '' // shows the address as stored, e.g. with https:// added
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

// ---- sharing
const removeMember = useMutation({
  mutationFn: (userId: string) => api.removeMember(props.profile.id, userId),
  onSuccess: async (_, userId) => {
    await refresh()
    if (userId === session.user?.id) await router.push('/') // you left; it's no longer yours to see
  },
})
const canRemove = (memberId: string, memberRole: string) =>
  (isOwner && memberRole !== 'owner') || (!isOwner && memberId === session.user?.id)

// ---- deletion
const deleteProfile = useMutation({
  mutationFn: () => api.deleteProfile(props.profile.id),
  onSuccess: async () => {
    queryClient.removeQueries({ queryKey: ['drafts'] })
    await refresh()
    await router.push('/')
  },
})
function confirmDelete() {
  if (
    confirm(
      `Delete "${props.profile.name}" and all its drafts for everyone who shares it? This can't be undone.`,
    )
  ) {
    deleteProfile.mutate()
  }
}

const primaryButton =
  'rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60'
</script>

<template>
  <div class="max-w-xl space-y-10">
    <header>
      <p class="mb-2 text-sm">
        <RouterLink :to="{ name: 'profile', params: { profileId: profile.id } }" class="underline">
          ← {{ profile.name }}
        </RouterLink>
      </p>
      <h1 class="font-serif text-2xl font-semibold">Profile settings</h1>
      <p class="mt-1 text-sm text-stone-600">
        Address: <code class="rounded bg-stone-100 px-1">/p/{{ profile.id }}</code>
      </p>
    </header>

    <section aria-labelledby="details-heading">
      <h2 id="details-heading" class="mb-3 font-serif text-xl font-semibold">Details</h2>
      <form v-if="isOwner" @submit.prevent="saveDetails.mutate()">
        <TextField v-model="name" label="Name" required autocomplete="off" />
        <TextField
          v-model="siteUrl"
          label="Website"
          autocomplete="off"
          hint="Where it gets published, for example https://yourname.substack.com. Leave empty for none."
        />
        <p v-if="saveDetails.isError.value" role="alert" class="mb-3 text-red-700">
          {{ errorMessage(saveDetails.error.value) }}
        </p>
        <div class="flex items-center gap-3">
          <button type="submit" :class="primaryButton" :disabled="saveDetails.isPending.value">
            {{ saveDetails.isPending.value ? 'Saving…' : 'Save details' }}
          </button>
          <p v-if="saveDetails.isSuccess.value" role="status" class="text-sm text-stone-700">
            Saved
          </p>
        </div>
      </form>
      <dl v-else class="text-sm">
        <dt class="font-medium">Name</dt>
        <dd class="mb-2">{{ profile.name }}</dd>
        <dt class="font-medium">Website</dt>
        <dd>{{ profile.siteUrl ? displayHost(profile.siteUrl) : 'None' }}</dd>
      </dl>
    </section>

    <section aria-labelledby="picture-heading">
      <h2 id="picture-heading" class="mb-3 font-serif text-xl font-semibold">Picture</h2>
      <div class="flex items-center gap-4">
        <ProfileImage
          :id="profile.id"
          :name="profile.name"
          :image-url="profile.imageUrl"
          size="lg"
        />
        <div v-if="isOwner" class="flex-1">
          <ImageField label="Choose a picture" @select="uploadImage.mutate($event)" />
          <button
            v-if="profile.imageUrl"
            type="button"
            class="text-sm underline"
            :disabled="removeImage.isPending.value"
            @click="removeImage.mutate()"
          >
            Remove picture
          </button>
        </div>
      </div>
      <p v-if="uploadImage.isPending.value" role="status" class="mt-2 text-sm">Uploading…</p>
      <p v-if="uploadImage.isError.value" role="alert" class="mt-2 text-red-700">
        {{ errorMessage(uploadImage.error.value) }}
      </p>
      <p v-if="removeImage.isError.value" role="alert" class="mt-2 text-red-700">
        {{ errorMessage(removeImage.error.value) }}
      </p>
    </section>

    <section aria-labelledby="sharing-heading">
      <h2 id="sharing-heading" class="mb-3 font-serif text-xl font-semibold">Sharing</h2>
      <ul class="text-sm">
        <li
          v-for="m in profile.members"
          :key="m.userId"
          class="flex items-center justify-between py-1"
        >
          <span>
            {{ m.name }}
            <span class="text-stone-600">({{ m.email }}, {{ m.role }})</span>
          </span>
          <button
            v-if="canRemove(m.userId, m.role)"
            type="button"
            class="underline"
            @click="removeMember.mutate(m.userId)"
          >
            {{ m.userId === session.user?.id ? 'Leave' : 'Remove' }}
          </button>
        </li>
      </ul>
      <ProfileInvitations
        v-if="isOwner"
        :profile-id="profile.id"
        :profile-name="profile.name"
        :confirmed="session.user?.emailVerified ?? false"
      />
      <p v-if="removeMember.isError.value" role="alert" class="mt-2 text-red-700">
        {{ errorMessage(removeMember.error.value) }}
      </p>
    </section>

    <section
      v-if="isOwner"
      aria-labelledby="delete-profile-heading"
      class="rounded border border-red-200 bg-red-50 p-4"
    >
      <h2 id="delete-profile-heading" class="mb-2 font-serif text-xl font-semibold text-red-900">
        Delete profile
      </h2>
      <p class="mb-3 text-sm">
        This permanently deletes the profile and all its drafts, for everyone it's shared with.
      </p>
      <p v-if="deleteProfile.isError.value" role="alert" class="mb-3 text-red-700">
        {{ errorMessage(deleteProfile.error.value) }}
      </p>
      <button
        type="button"
        class="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white"
        @click="confirmDelete"
      >
        Delete this profile
      </button>
    </section>
  </div>
</template>
