<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { onBeforeUnmount, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import Explain from '../components/Explain.vue'
import ImageField from '../components/ImageField.vue'
import PublicationImage from '../components/PublicationImage.vue'
import TextField from '../components/TextField.vue'
import { api, errorMessage } from '../lib/api'

const router = useRouter()
const queryClient = useQueryClient()

const name = ref('')
const siteUrl = ref('')
const image = ref<File>()
const preview = ref<string>()
/** Set once the publication exists, so a failed picture upload doesn't lead to a duplicate publication. */
const createdId = ref<string>()

function pick(file: File) {
  if (preview.value) URL.revokeObjectURL(preview.value)
  image.value = file
  preview.value = URL.createObjectURL(file)
}
onBeforeUnmount(() => preview.value && URL.revokeObjectURL(preview.value))

const create = useMutation({
  mutationFn: async () => {
    if (!createdId.value) {
      const publication = await api.createPublication({
        name: name.value,
        siteUrl: siteUrl.value.trim() || null,
      })
      createdId.value = publication.id
    }
    if (image.value) await api.setPublicationImage(createdId.value, image.value)
    return createdId.value
  },
  onSuccess: async (id) => {
    await queryClient.invalidateQueries({ queryKey: ['publications'] })
    await router.push({ name: 'publication', params: { publicationId: id } })
  },
  // Even if the picture failed, the publication now exists and should appear in lists.
  onError: () => queryClient.invalidateQueries({ queryKey: ['publications'] }),
})
</script>

<template>
  <section aria-labelledby="new-publication-heading" class="max-w-xl">
    <h1 id="new-publication-heading" class="mb-6 font-display text-2xl font-semibold">
      New publication
    </h1>
    <Explain tutorial-only class="mb-6">
      A publication is a place you publish, like a Substack or a blog. It keeps its ideas and drafts
      together.
    </Explain>

    <form @submit.prevent="create.mutate()">
      <TextField
        v-model="name"
        label="Publication name"
        required
        autocomplete="off"
        hint="For example, “Weekly letters” or “My blog”."
      />
      <TextField
        v-model="siteUrl"
        label="Website (optional)"
        autocomplete="off"
        hint="Where it gets published, for example https://yourname.substack.com."
      />
      <Explain label="About the website" class="-mt-2 mb-4">
        We fetch the site’s icon from this address and use it until you add a picture.
      </Explain>

      <div class="flex items-center gap-4">
        <PublicationImage id="preview" :name="name || '?'" :image-url="preview" size="lg" />
        <div class="flex-1">
          <ImageField
            label="Picture (optional)"
            hint="PNG, JPEG, WebP or GIF. A GIF must be under 1 MB."
            @select="pick"
          />
        </div>
      </div>

      <p v-if="create.isError.value" role="alert" class="mb-3 text-danger">
        <template v-if="createdId">
          Your publication was created, but we couldn’t upload its picture.
          {{ errorMessage(create.error.value) }}
          Try again, or
          <RouterLink
            :to="{ name: 'publication', params: { publicationId: createdId } }"
            class="underline"
          >
            go to your publication</RouterLink
          >.
        </template>
        <template v-else>{{ errorMessage(create.error.value) }}</template>
      </p>
      <div class="flex items-center gap-3">
        <button type="submit" class="btn btn-primary" :disabled="create.isPending.value">
          {{ create.isPending.value ? 'Creating…' : 'Create publication' }}
        </button>
        <RouterLink to="/" class="text-sm underline">Cancel</RouterLink>
      </div>
    </form>
  </section>
</template>
