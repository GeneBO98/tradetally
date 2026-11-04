import { ref, readonly } from 'vue'

// Single reactive mirror of the `dark` class on <html>. Canvas charts can't
// pick up Tailwind's dark: variants, so they watch this and re-render with
// theme-appropriate colors when the user toggles the theme.
const isDark = ref(typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))
let observer = null

function ensureObserver() {
  if (observer || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return
  observer = new MutationObserver(() => {
    const next = document.documentElement.classList.contains('dark')
    if (next !== isDark.value) isDark.value = next
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
}

export function useDarkMode() {
  ensureObserver()
  return { isDark: readonly(isDark) }
}
