<script setup lang="ts">
import { profileIdFor } from '@lfwa/core'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, onBeforeUnmount, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ImageField from '../components/ImageField.vue'
import ProfileImage from '../components/ProfileImage.vue'
import TextField from '../components/TextField.vue'
import { api, errorMessage } from '../lib/api'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const router = useRouter()
const queryClient = useQueryClient()

const name = ref('')
const siteUrl = ref('')
const image = ref<File>()
const preview = ref<string>()
/** Set once the profile exists, so a failed picture upload doesn't lead to a duplicate profile. */
const createdId = ref<string>()

function pick(file: File) {
  if (preview.value) URL.revokeObjectURL(preview.value)
  image.value = file
  preview.value = URL.createObjectURL(file)
}
onBeforeUnmount(() => preview.value && URL.revokeObjectURL(preview.value))

// The address people will share. The server adds a number if you already have one like it.
const address = computed(() =>
  name.value.trim() && session.user ? `/p/${profileIdFor(session.user.handle, name.value)}` : '',
)

const create = useMutation({
  mutationFn: async () => {
    if (!createdId.value) {
      const profile = await api.createProfile({
        name: name.value,
        siteUrl: siteUrl.value.trim() || null,
      })
      createdId.value = profile.id
    }
    if (image.value) await api.setProfileImage(createdId.value, image.value)
    return createdId.value
  },
  onSuccess: async (id) => {
    await queryClient.invalidateQueries({ queryKey: ['profiles'] })
    await router.push({ name: 'profile', params: { profileId: id } })
  },
  // Even if the picture failed, the profile now exists and should appear in lists.
  onError: () => queryClient.invalidateQueries({ queryKey: ['profiles'] }),
})
</script>

<template>
  <section aria-labelledby="new-profile-heading" class="max-w-xl">
    <p class="mb-2 text-sm">
      <RouterLink to="/" class="underline">← Your profiles</RouterLink>
    </p>
    <h1 id="new-profile-heading" class="mb-1 font-serif text-2xl font-semibold">New profile</h1>
    <p class="mb-6 text-stone-700">
      A profile is a place you publish, like a Substack or a blog. Its ideas, readers and drafts
      live together.
    </p>

    <form @submit.prevent="create.mutate()">
      <TextField
        v-model="name"
        label="Name"
        required
        autocomplete="off"
        hint="For example, “Weekly letters” or “My blog”."
      />
      <p v-if="address" class="-mt-2 mb-4 text-sm text-stone-600">
        Its address will be <code class="rounded bg-stone-100 px-1">{{ address }}</code>
      </p>
      <TextField
        v-model="siteUrl"
        label="Website (optional)"
        autocomplete="off"
        hint="Where it gets published, for example https://yourname.substack.com."
      />

      <div class="flex items-center gap-4">
        <ProfileImage id="preview" :name="name || '?'" :image-url="preview" size="lg" />
        <div class="flex-1">
          <ImageField label="Picture (optional)" @select="pick" />
        </div>
      </div>

      <p v-if="create.isError.value" role="alert" class="mb-3 text-red-700">
        <template v-if="createdId">
          Your profile was created, but its picture couldn't be uploaded:
          {{ errorMessage(create.error.value) }}
          <RouterLink :to="{ name: 'profile', params: { profileId: createdId } }" class="underline">
            Go to your profile
          </RouterLink>
          or try the picture again.
        </template>
        <template v-else>{{ errorMessage(create.error.value) }}</template>
      </p>
      <div class="flex items-center gap-3">
        <button
          type="submit"
          class="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          :disabled="create.isPending.value"
        >
          {{ create.isPending.value ? 'Creating…' : 'Create profile' }}
        </button>
        <RouterLink to="/" class="text-sm underline">Cancel</RouterLink>
      </div>
    </form>
  </section>
</template>
