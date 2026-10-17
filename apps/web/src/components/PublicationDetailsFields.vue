<script setup lang="ts">
import type { useSiteIconPreview } from '../lib/site-icon-preview'
import Explain from './Explain.vue'
import PublicationImage from './PublicationImage.vue'
import TextField from './TextField.vue'

/**
 * The name and website of a publication: the same two fields, hints and explanation when one is made and when it is
 * changed in its settings, so the two forms can't drift apart. Pass `existing` when changing one: the name then says
 * what renaming does, and the icon found for a new address is shown beside the saved one.
 */
defineProps<{
  siteIcon: ReturnType<typeof useSiteIconPreview>
  /** The saved publication, when this is its settings rather than its creation. */
  existing?: { id: string; name: string; siteUrl: string | null }
}>()
const name = defineModel<string>('name', { required: true })
const siteUrl = defineModel<string>('siteUrl', { required: true })
</script>

<template>
  <TextField
    v-model="name"
    label="Publication name"
    required
    autocomplete="off"
    hint="For example, “Weekly letters” or “My blog”."
  />
  <Explain v-if="existing" label="About the name" class="-mt-2 mb-4">
    Changing the name changes the publication’s address.
  </Explain>
  <TextField
    v-model="siteUrl"
    label="Website (optional)"
    autocomplete="off"
    hint="Where it gets published."
    @focusout="siteIcon.look(siteUrl, existing?.siteUrl)"
  />
  <Explain label="About the website" class="-mt-2 mb-4">
    We fetch the site’s icon from this address and use it until you add a picture.
  </Explain>
  <p v-if="existing && siteIcon.icon.value" class="meta -mt-2 mb-4 flex items-center gap-2">
    <PublicationImage
      :id="existing.id"
      :name="existing.name"
      kind="source"
      :image-url="siteIcon.icon.value.iconUrl"
      :square="siteIcon.icon.value.square"
      size="xs"
    />
    Icon found for this address
  </p>
</template>
