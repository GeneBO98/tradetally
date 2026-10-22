import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

/**
 * Pure helper so non-component code (stores, tests) can share the rule.
 * A user has Pro access when billing is disabled (self-hosted), their tier is
 * 'pro', or they are an admin/owner (the backend grants admins Pro).
 * Returns false when the user is not loaded yet so Pro content never flashes.
 */
export function hasProAccess(user) {
  if (!user) return false
  if (user.billingEnabled === false) return true
  if (user.tier === 'pro') return true
  return user.role === 'admin' || user.role === 'owner'
}

/**
 * Shared Pro-tier gate for views and components.
 *
 * - isProUser: true only once the user is loaded and has Pro access. Use it to
 *   decide whether to render Pro content or call Pro-only endpoints.
 * - isTierResolved: true once the user object is loaded.
 * - showProLock: true only once the user is loaded and lacks Pro access. Use it
 *   for lock overlays / upgrade prompts so Pro users never see a flash of locks
 *   while /auth/me is still in flight.
 */
export function useProAccess() {
  const authStore = useAuthStore()

  const isTierResolved = computed(() => !!authStore.user)
  const isProUser = computed(() => hasProAccess(authStore.user))
  const showProLock = computed(() => isTierResolved.value && !isProUser.value)

  return { isProUser, isTierResolved, showProLock }
}

export default useProAccess
