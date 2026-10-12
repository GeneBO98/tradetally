<template>
  <div class="content-wrapper py-8">
    <div class="flex flex-col items-center justify-center py-24 text-center">
      <p class="text-6xl font-bold text-gray-300 dark:text-gray-600">404</p>
      <h1 class="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Page not found</h1>
      <p class="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
        The page you're looking for doesn't exist or may have moved.
      </p>
      <router-link to="/dashboard" class="btn-primary mt-6">
        Back to Dashboard
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from 'vue'

// The server falls back to index.html with a 200 for unknown paths, so tell
// crawlers this is a 404 to keep it out of the index as a soft 404.
let robotsMeta = null
let previousRobots = null

onMounted(() => {
  robotsMeta = document.head.querySelector('meta[name="robots"]')
  if (robotsMeta) {
    previousRobots = robotsMeta.getAttribute('content')
  } else {
    robotsMeta = document.createElement('meta')
    robotsMeta.setAttribute('name', 'robots')
    document.head.appendChild(robotsMeta)
  }
  robotsMeta.setAttribute('content', 'noindex')
})

onBeforeUnmount(() => {
  if (!robotsMeta) return
  if (previousRobots === null) robotsMeta.remove()
  else robotsMeta.setAttribute('content', previousRobots)
})
</script>
