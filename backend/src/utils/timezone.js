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

module.exports = {
  getUserTimezone,
  getDateInTimezone,
  getDayOfWeekInTimezone,
  getUserLocalDate,
  getUserDayOfWeek
};