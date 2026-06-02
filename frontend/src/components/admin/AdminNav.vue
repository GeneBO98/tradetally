<template>
  <nav class="mb-6 border-b border-gray-200 dark:border-gray-700">
    <ul class="-mb-px flex flex-wrap items-center gap-1 overflow-x-auto" role="tablist">
      <li v-for="tab in tabs" :key="tab.route">
        <router-link
          :to="tab.to"
          class="admin-tab group"
          :class="$route.name === tab.route ? 'admin-tab--active' : ''"
          role="tab"
          :aria-current="$route.name === tab.route ? 'page' : undefined"
        >
          <component :is="tab.icon" class="h-4 w-4 shrink-0" />
          <span>{{ tab.name }}</span>
        </router-link>
      </li>
    </ul>
  </nav>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import {
  UsersIcon,
  KeyIcon,
  ChatBubbleBottomCenterTextIcon,
  CircleStackIcon
} from '@heroicons/vue/24/outline'
import { useRegistrationMode } from '@/composables/useRegistrationMode'

const { isBillingEnabled, fetchRegistrationConfig } = useRegistrationMode()

onMounted(() => {
  // isBillingEnabled depends on the registration config, which is otherwise
  // only fetched on Home/Login/Register. If an admin lands here directly we
  // need to trigger the fetch so OAuth/Testimonials tabs can appear.
  fetchRegistrationConfig().catch(() => { /* fall back to defaults */ })
})

const tabs = computed(() => {
  const list = [
    { name: 'Users', to: '/admin/users', route: 'admin-users', icon: UsersIcon }
  ]
  if (isBillingEnabled.value) {
    list.push(
      { name: 'OAuth Applications', to: '/admin/oauth', route: 'oauth-clients', icon: KeyIcon },
      { name: 'Testimonials', to: '/admin/testimonials', route: 'admin-testimonials', icon: ChatBubbleBottomCenterTextIcon }
    )
  }
  list.push({ name: 'Backups', to: '/admin/backups', route: 'admin-backups', icon: CircleStackIcon })
  return list
})
</script>

<style scoped>
.admin-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.875rem;
  border-bottom: 2px solid transparent;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(107 114 128);
  white-space: nowrap;
  transition: color 150ms, border-color 150ms;
}

:global(.dark) .admin-tab,
.dark .admin-tab {
  color: rgb(156 163 175);
}

.admin-tab:hover {
  color: rgb(17 24 39);
  border-bottom-color: rgb(209 213 219);
}

:global(.dark) .admin-tab:hover,
.dark .admin-tab:hover {
  color: rgb(229 231 235);
  border-bottom-color: rgb(75 85 99);
}

.admin-tab--active {
  color: rgb(194 65 12);
  border-bottom-color: rgb(240 129 42);
}

:global(.dark) .admin-tab--active,
.dark .admin-tab--active {
  color: rgb(253 186 116);
  border-bottom-color: rgb(251 146 60);
}

.admin-tab--active:hover,
:global(.dark) .admin-tab--active:hover,
.dark .admin-tab--active:hover {
  border-bottom-color: rgb(240 129 42);
}
</style>
