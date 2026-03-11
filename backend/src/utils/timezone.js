const db = require('../config/database');

/**
 * Get user's timezone from database
 * @param {string} userId - User ID
 * @returns {Promise<string>} User's timezone (defaults to 'UTC')
 */
async function getUserTimezone(userId) {
  try {
    if (!userId) {
      return 'UTC';
    }
    
    const query = 'SELECT timezone FROM users WHERE id = $1';
    const result = await db.query(query, [userId]);
    
    if (result.rows.length === 0) {
      console.warn(`User ${userId} not found, using UTC timezone`);
      return 'UTC';
    }
    
    return result.rows[0].timezone || 'UTC';
  } catch (error) {
    console.error('Error getting user timezone:', error);
    return 'UTC';
  }
}

/**
 * Convert a timestamp to a specific timezone and extract the date
 * @param {string|Date} timestamp - The timestamp to convert
 * @param {string} timezone - Target timezone (e.g., 'America/New_York', 'UTC')
 * @returns {string} Date in YYYY-MM-DD format in the target timezone
 */
function getDateInTimezone(timestamp, timezone = 'UTC', includeTime) {
  try {
    if (!timestamp) {
      return null;
    }
    
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      console.error('Invalid timestamp:', timestamp);
      return null;
    }
    
    if (includeTime === undefined) {
      includeTime = (typeof timestamp === 'string' && timestamp.includes('T'));
    }
    
    const options = includeTime
      ? { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
      : { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' };
    
    // Use Intl.DateTimeFormat to get the date (and time if includeTime is true) in the target timezone
    const formatter = new Intl.DateTimeFormat('en-CA', options);
    
    const localDate = formatter.format(date);
    return localDate;
  } catch (error) {
    console.error('Error converting timestamp to timezone:', error, { timestamp, timezone });
    // Fallback to UTC
    return new Date(timestamp).toISOString().split('T')[0];
  }
}

/**
 * Get day of week (0-6, Sunday=0) for a date in a specific timezone
 * @param {string|Date} timestamp - The timestamp
 * @param {string} timezone - Target timezone
 * @returns {number} Day of week (0-6, Sunday=0)
 */
function getDayOfWeekInTimezone(timestamp, timezone = 'UTC') {
  try {
    if (!timestamp) {
      return null;
    }

    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      console.error('Invalid timestamp for day of week:', timestamp);
      return null;
    }

    // Create a new date object in the target timezone
    const localDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    return localDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
  } catch (error) {
    console.error('Error getting day of week in timezone:', error, { timestamp, timezone });
    // Fallback to UTC
    return new Date(timestamp).getUTCDay();
  }
}

/**
 * Convert a timestamp to user's local timezone and extract date or datetime
 * @param {string} userId - User ID
 * @param {string|Date} timestamp - The timestamp to convert
 * @param {boolean} [includeTime] - If true, include time details
 * @returns {Promise<string>} Date (or datetime) in user's timezone
 */
async function getUserLocalDate(userId, timestamp, includeTime) {
  const userTimezone = await getUserTimezone(userId);
  return getDateInTimezone(timestamp, userTimezone, includeTime);
}

/**
 * Get day of week for a timestamp in user's timezone
 * @param {string} userId - User ID
 * @param {string|Date} timestamp - The timestamp
 * @returns {Promise<number>} Day of week (0-6, Sunday=0) in user's timezone
 */
async function getUserDayOfWeek(userId, timestamp) {
  const userTimezone = await getUserTimezone(userId);
  return getDayOfWeekInTimezone(timestamp, userTimezone);
}

/**
 * Convert a naive datetime string (no timezone info) from a given timezone to UTC.
 * If the datetime already has a Z suffix or timezone offset, it is returned as-is.
 *
 * @param {string} naiveDatetime - Datetime string like "2025-09-05T16:33:00"
 * @param {string} timezone - IANA timezone (e.g., "Europe/Berlin", "America/New_York")
 * @returns {string|null} UTC datetime with Z suffix, e.g., "2025-09-05T14:33:00Z"
 */
function localToUTC(naiveDatetime, timezone) {
  if (!naiveDatetime || !timezone || timezone === 'UTC') {
    // If already UTC or no timezone provided, just ensure Z suffix
    if (naiveDatetime && !naiveDatetime.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(naiveDatetime)) {
      return naiveDatetime + 'Z';
    }
    return naiveDatetime;
  }

  // If it already has timezone info, return as-is
  if (naiveDatetime.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(naiveDatetime)) {
    return naiveDatetime;
  }

  try {
    // Parse the components from the naive datetime string
    // Expected format: YYYY-MM-DDTHH:MM:SS or YYYY-MM-DD HH:MM:SS (also handles without seconds)
    const match = naiveDatetime.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) {
      // If we can't parse it, just append Z and hope for the best
      return naiveDatetime + 'Z';
    }

    const [, yearStr, monthStr, dayStr, hourStr, minStr, secStr = '00'] = match;
    const year = parseInt(yearStr);
    const month = parseInt(monthStr) - 1; // JS months are 0-indexed
    const day = parseInt(dayStr);
    const hour = parseInt(hourStr);
    const min = parseInt(minStr);
    const sec = parseInt(secStr);

    // Use Intl.DateTimeFormat to find the UTC offset for the given timezone at the given local time.
    // Strategy: We create a UTC date with the same numeric components, then use the formatter
    // to find what the offset is at that moment in the target timezone.

    // First estimate: treat the datetime as UTC and find what the local time would be
    const estimateUTC = new Date(Date.UTC(year, month, day, hour, min, sec));

    // Get the local representation in the target timezone
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(estimateUTC);

    const getPart = (type) => {
      const p = parts.find(p => p.type === type);
      return p ? parseInt(p.value) : 0;
    };

    const localYear = getPart('year');
    const localMonth = getPart('month') - 1;
    const localDay = getPart('day');
    const localHour = getPart('hour') === 24 ? 0 : getPart('hour');
    const localMin = getPart('minute');
    const localSec = getPart('second');

    // Compute offset: local = UTC + offset, so offset = local - UTC (in ms)
    const localMs = new Date(localYear, localMonth, localDay, localHour, localMin, localSec).getTime();
    const utcMs = new Date(year, month, day, hour, min, sec).getTime();
    const offsetMs = localMs - utcMs;

    // The actual UTC time = naive datetime interpreted as local - offset
    // naive local = UTC + offset => UTC = naive local - offset
    const resultUTC = new Date(estimateUTC.getTime() - offsetMs);

    // Verify with a second iteration for DST edge cases
    const verifyParts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(resultUTC);

    const getVerifyPart = (type) => {
      const p = verifyParts.find(p => p.type === type);
      return p ? parseInt(p.value) : 0;
    };

    const vHour = getVerifyPart('hour') === 24 ? 0 : getVerifyPart('hour');
    const vMin = getVerifyPart('minute');

    // If the verification doesn't match (DST transition edge case), adjust
    if (vHour !== hour || vMin !== min) {
      const vLocalMs = new Date(
        getVerifyPart('year'),
        getVerifyPart('month') - 1,
        getVerifyPart('day'),
        vHour,
        vMin,
        getVerifyPart('second')
      ).getTime();
      const targetLocalMs = new Date(year, month, day, hour, min, sec).getTime();
      const correction = targetLocalMs - vLocalMs;
      const correctedUTC = new Date(resultUTC.getTime() + correction);
      return correctedUTC.toISOString().replace(/\.\d{3}Z$/, 'Z');
    }

    return resultUTC.toISOString().replace(/\.\d{3}Z$/, 'Z');
  } catch (error) {
    console.error('Error in localToUTC:', error, { naiveDatetime, timezone });
    // Fallback: just append Z
    return naiveDatetime + 'Z';
  }
}

module.exports = {
  getUserTimezone,
  getDateInTimezone,
  getDayOfWeekInTimezone,
  getUserLocalDate,
  getUserDayOfWeek,
  localToUTC
};