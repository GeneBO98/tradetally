import { ref, watch } from 'vue'

const STORAGE_KEY = 'sidebarCollapsed'

function loadCollapsed() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch (_) {
    return false
  }
}

const drawerOpen = ref(false)
const collapsed = ref(loadCollapsed())

watch(collapsed, (value) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false')
  } catch (_) {
    // ignore storage failures (private mode, etc.)
  }
})

export function useSidebar() {
  return {
    drawerOpen,
    collapsed,
    openDrawer: () => { drawerOpen.value = true },
    closeDrawer: () => { drawerOpen.value = false },
    toggleDrawer: () => { drawerOpen.value = !drawerOpen.value },
    toggleCollapsed: () => { collapsed.value = !collapsed.value },
    expandSidebar: () => { collapsed.value = false }
  }
}
