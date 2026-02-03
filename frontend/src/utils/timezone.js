/**
 * Timezone utilities for converting between UTC and user's local timezone
 * Uses Intl.DateTimeFormat - no external dependencies required
 */

/**
 * Comprehensive list of timezone options for the profile selector
 * Grouped by region for better UX
 */
export const TIMEZONE_OPTIONS = [
  // UTC
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)', group: 'UTC' },

  // United States
  { value: 'America/New_York', label: 'Eastern Time (ET)', group: 'United States' },
  { value: 'America/Chicago', label: 'Central Time (CT)', group: 'United States' },
  { value: 'America/Denver', label: 'Mountain Time (MT)', group: 'United States' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)', group: 'United States' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)', group: 'United States' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)', group: 'United States' },

  // Europe
  { value: 'Europe/London', label: 'London (GMT/BST)', group: 'Europe' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)', group: 'Europe' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)', group: 'Europe' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam (CET/CEST)', group: 'Europe' },
  { value: 'Europe/Zurich', label: 'Zurich (CET/CEST)', group: 'Europe' },
  { value: 'Europe/Moscow', label: 'Moscow (MSK)', group: 'Europe' },

  // Asia Pacific
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)', group: 'Asia Pacific' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)', group: 'Asia Pacific' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)', group: 'Asia Pacific' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)', group: 'Asia Pacific' },
  { value: 'Asia/Seoul', label: 'Seoul (KST)', group: 'Asia Pacific' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)', group: 'Asia Pacific' },
  { value: 'Asia/Kolkata', label: 'India (IST)', group: 'Asia Pacific' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)', group: 'Asia Pacific' },
  { value: 'Australia/Perth', label: 'Perth (AWST)', group: 'Asia Pacific' },

  // Americas (non-US)
  { value: 'America/Toronto', label: 'Toronto (ET)', group: 'Americas' },
  { value: 'America/Vancouver', label: 'Vancouver (PT)', group: 'Americas' },
  { value: 'America/Mexico_City', label: 'Mexico City (CT)', group: 'Americas' },
  { value: 'America/Sao_Paulo', label: 'Sao Paulo (BRT)', group: 'Americas' }
]

/**
 * Get timezone abbreviation label for display
 * @param {string} timezone - IANA timezone identifier
 * @returns {string} Short timezone label (e.g., "ET", "PT", "UTC")
 */
export function getTimezoneLabel(timezone) {
  if (!timezone || timezone === 'UTC') return 'UTC'

  const labels = {
    'America/New_York': 'ET',
    'America/Chicago': 'CT',
    'America/Denver': 'MT',
    'America/Los_Angeles': 'PT',
    'America/Anchorage': 'AKT',
    'Pacific/Honolulu': 'HST',
    'Europe/London': 'GMT',
    'Europe/Paris': 'CET',
    'Europe/Berlin': 'CET',
    'Europe/Amsterdam': 'CET',
    'Europe/Zurich': 'CET',
    'Europe/Moscow': 'MSK',
    'Asia/Tokyo': 'JST',
    'Asia/Hong_Kong': 'HKT',
    'Asia/Singapore': 'SGT',
    'Asia/Shanghai': 'CST',
    'Asia/Seoul': 'KST',
    'Asia/Dubai': 'GST',
    'Asia/Kolkata': 'IST',
    'Australia/Sydney': 'AEST',
    'Australia/Perth': 'AWST',
    'America/Toronto': 'ET',
    'America/Vancouver': 'PT',
    'America/Mexico_City': 'CT',
    'America/Sao_Paulo': 'BRT'
  }

  return labels[timezone] || timezone.split('/').pop()
}

/**
 * Format a UTC datetime string for display in the user's timezone
 * @param {string|Date} utcDateTime - ISO datetime string or Date object (assumed UTC)
 * @param {string} timezone - IANA timezone identifier (e.g., 'America/New_York')
 * @param {object} options - Formatting options
 * @param {boolean} options.includeDate - Include date in output (default: true)
 * @param {boolean} options.includeTime - Include time in output (default: true)
 * @param {boolean} options.includeSeconds - Include seconds in time (default: false)
 * @returns {string} Formatted datetime string
 */
export function formatDateTimeInTimezone(utcDateTime, timezone = 'UTC', options = {}) {
  if (!utcDateTime) return 'N/A'

  const { includeDate = true, includeTime = true, includeSeconds = false } = options

  try {
    // Parse the datetime
    const date = new Date(utcDateTime)
    if (isNaN(date.getTime())) return 'Invalid Date'

    // Build format options
    const formatOptions = {
      timeZone: timezone
    }

    if (includeDate) {
      formatOptions.year = 'numeric'
      formatOptions.month = 'short'
      formatOptions.day = '2-digit'
    }

    if (includeTime) {
      formatOptions.hour = '2-digit'
      formatOptions.minute = '2-digit'
      formatOptions.hour12 = false

      if (includeSeconds) {
        formatOptions.second = '2-digit'
      }
    }

    const formatter = new Intl.DateTimeFormat('en-US', formatOptions)
    return formatter.format(date)
  } catch (error) {
    console.error('[TIMEZONE] Error formatting datetime:', error, { utcDateTime, timezone })
    return 'Invalid Date'
  }
}

/**
 * Format only the time portion for display in user's timezone
 * @param {string|Date} utcDateTime - ISO datetime string or Date object (assumed UTC)
 * @param {string} timezone - IANA timezone identifier
 * @returns {string} Formatted time string (e.g., "14:30")
 */
export function formatTimeInTimezone(utcDateTime, timezone = 'UTC') {
  return formatDateTimeInTimezone(utcDateTime, timezone, { includeDate: false, includeTime: true })
}

/**
 * Convert a datetime-local input value (user's timezone) to UTC ISO string
 * This is used when the user enters a time in a form input
 * @param {string} localDateTimeValue - Value from datetime-local input (YYYY-MM-DDTHH:mm)
 * @param {string} timezone - User's timezone
 * @returns {string|null} UTC ISO string or null if invalid
 */
export function localInputToUTC(localDateTimeValue, timezone = 'UTC') {
  if (!localDateTimeValue) return null

  try {
    // Parse the datetime-local value (format: YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss)
    const match = localDateTimeValue.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
    if (!match) {
      console.warn('[TIMEZONE] Invalid datetime-local format:', localDateTimeValue)
      return null
    }

    const [, year, month, day, hour, minute, second = '00'] = match

    // Create a formatter to get the offset for this timezone at this datetime
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })

    // Create a date assuming UTC, then find the offset
    // This is complex because we need to find what UTC time corresponds to the local time
    const targetLocalParts = {
      year: parseInt(year),
      month: parseInt(month) - 1, // JS months are 0-indexed
      day: parseInt(day),
      hour: parseInt(hour),
      minute: parseInt(minute),
      second: parseInt(second)
    }

    // Start with an estimate (treating local as UTC)
    let utcEstimate = new Date(Date.UTC(
      targetLocalParts.year,
      targetLocalParts.month,
      targetLocalParts.day,
      targetLocalParts.hour,
      targetLocalParts.minute,
      targetLocalParts.second
    ))

    // Iterate to find the correct UTC time (handles DST edge cases)
    for (let i = 0; i < 3; i++) {
      const parts = formatter.formatToParts(utcEstimate)
      const localTime = {}
      for (const part of parts) {
        if (part.type === 'year') localTime.year = parseInt(part.value)
        if (part.type === 'month') localTime.month = parseInt(part.value) - 1
        if (part.type === 'day') localTime.day = parseInt(part.value)
        if (part.type === 'hour') localTime.hour = parseInt(part.value)
        if (part.type === 'minute') localTime.minute = parseInt(part.value)
        if (part.type === 'second') localTime.second = parseInt(part.value)
      }

      // Calculate the difference
      const diffMs = (
        (targetLocalParts.year - localTime.year) * 365.25 * 24 * 60 * 60 * 1000 +
        (targetLocalParts.month - localTime.month) * 30 * 24 * 60 * 60 * 1000 +
        (targetLocalParts.day - localTime.day) * 24 * 60 * 60 * 1000 +
        (targetLocalParts.hour - localTime.hour) * 60 * 60 * 1000 +
        (targetLocalParts.minute - localTime.minute) * 60 * 1000 +
        (targetLocalParts.second - localTime.second) * 1000
      )

      if (Math.abs(diffMs) < 1000) break // Close enough

      utcEstimate = new Date(utcEstimate.getTime() + diffMs)
    }

    return utcEstimate.toISOString()
  } catch (error) {
    console.error('[TIMEZONE] Error converting local to UTC:', error, { localDateTimeValue, timezone })
    return null
  }
}

/**
 * Convert a UTC ISO string to a datetime-local input value in user's timezone
 * This is used to populate form inputs with existing data
 * @param {string|Date} utcDateTime - UTC ISO string or Date object
 * @param {string} timezone - User's timezone
 * @returns {string} Value suitable for datetime-local input (YYYY-MM-DDTHH:mm)
 */
export function utcToLocalInput(utcDateTime, timezone = 'UTC') {
  if (!utcDateTime) return ''

  try {
    const date = new Date(utcDateTime)
    if (isNaN(date.getTime())) return ''

    // Format as parts in the target timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })

    const parts = formatter.formatToParts(date)
    const values = {}
    for (const part of parts) {
      values[part.type] = part.value
    }

    // Handle midnight being formatted as 24:00 in some locales
    let hour = values.hour
    if (hour === '24') hour = '00'

    // Return in datetime-local format: YYYY-MM-DDTHH:mm
    return `${values.year}-${values.month}-${values.day}T${hour}:${values.minute}`
  } catch (error) {
    console.error('[TIMEZONE] Error converting UTC to local input:', error, { utcDateTime, timezone })
    return ''
  }
}

/**
 * Get the current time in a specific timezone formatted for datetime-local input
 * @param {string} timezone - User's timezone
 * @returns {string} Current time in datetime-local format
 */
export function getCurrentTimeForInput(timezone = 'UTC') {
  return utcToLocalInput(new Date().toISOString(), timezone)
}
