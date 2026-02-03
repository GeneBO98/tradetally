import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  formatDateTimeInTimezone,
  formatTimeInTimezone,
  localInputToUTC,
  utcToLocalInput,
  getCurrentTimeForInput,
  getTimezoneLabel
} from '@/utils/timezone'

/**
 * Composable for timezone-aware datetime formatting
 * Uses the user's timezone preference from their profile
 */
export function useUserTimezone() {
  const authStore = useAuthStore()

  /**
   * The user's selected timezone (defaults to UTC)
   */
  const userTimezone = computed(() => {
    return authStore.user?.timezone || 'UTC'
  })

  /**
   * Human-readable timezone abbreviation (e.g., "ET", "PT", "UTC")
   */
  const timezoneLabel = computed(() => {
    return getTimezoneLabel(userTimezone.value)
  })

  /**
   * Format a UTC datetime for display in the user's timezone
   * @param {string|Date} utcDateTime - UTC datetime string or Date
   * @param {object} options - Formatting options
   * @returns {string} Formatted datetime string
   */
  function formatDateTime(utcDateTime, options = {}) {
    return formatDateTimeInTimezone(utcDateTime, userTimezone.value, options)
  }

  /**
   * Format only the time portion for display in user's timezone
   * @param {string|Date} utcDateTime - UTC datetime string or Date
   * @returns {string} Formatted time string (e.g., "14:30")
   */
  function formatTime(utcDateTime) {
    return formatTimeInTimezone(utcDateTime, userTimezone.value)
  }

  /**
   * Convert a datetime-local input value (user's timezone) to UTC ISO string
   * Use this when saving form data to the server
   * @param {string} localValue - Value from datetime-local input
   * @returns {string|null} UTC ISO string
   */
  function toUTC(localValue) {
    return localInputToUTC(localValue, userTimezone.value)
  }

  /**
   * Convert a UTC datetime to a value suitable for datetime-local input
   * Use this when populating forms with existing data
   * @param {string|Date} utcDateTime - UTC datetime
   * @returns {string} Value for datetime-local input
   */
  function toLocalInput(utcDateTime) {
    return utcToLocalInput(utcDateTime, userTimezone.value)
  }

  /**
   * Get the current time formatted for datetime-local input in user's timezone
   * @returns {string} Current time in datetime-local format
   */
  function getCurrentTimeLocal() {
    return getCurrentTimeForInput(userTimezone.value)
  }

  return {
    userTimezone,
    timezoneLabel,
    formatDateTime,
    formatTime,
    toUTC,
    toLocalInput,
    getCurrentTimeLocal
  }
}
