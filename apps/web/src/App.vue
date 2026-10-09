<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="min-h-screen">
    <header class="border-b border-stone-200 bg-white/60">
      <nav class="mx-auto flex max-w-3xl items-center justify-between px-4 py-3" aria-label="Main">
        <RouterLink to="/" class="font-serif text-lg font-semibold text-accent">
          Long-form Writing Assistant
        </RouterLink>
      </nav>
    </header>
    <main class="mx-auto max-w-3xl px-4 py-8">
      <RouterView />
    </main>
  </div>
</template>
