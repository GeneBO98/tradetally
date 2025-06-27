<template>
  <div id="app">
    <NavBar v-if="!isAuthRoute" />
    <main class="min-h-screen">
      <router-view />
    </main>
    <Notification />
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import NavBar from '@/components/layout/NavBar.vue'
import Notification from '@/components/common/Notification.vue'

const route = useRoute()
const authStore = useAuthStore()

const isAuthRoute = computed(() => {
  return ['login', 'register'].includes(route.name)
})

onMounted(() => {
  authStore.checkAuth()
})
</script>