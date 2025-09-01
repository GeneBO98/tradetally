/**
 * Utility functions for checking market hours
 */

/**
 * Check if current time is within US market hours
 * US Markets are open Monday-Friday 9:30 AM - 4:00 PM ET
 * Extended hours: 4:00 AM - 9:30 AM (pre-market) and 4:00 PM - 8:00 PM (after-hours)
 * 
 * @param {boolean} includeExtended - Include extended trading hours (default: true)
 * @returns {object} - { isOpen, isPreMarket, isAfterHours, isRegularHours, nextOpen, nextClose }
 */
export function getMarketStatus(includeExtended = true) {
  const now = new Date()
  
  // Convert to ET (Eastern Time)
  const etTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}))
  const dayOfWeek = etTime.getDay() // 0 = Sunday, 6 = Saturday
  const hours = etTime.getHours()
  const minutes = etTime.getMinutes()
  const timeInMinutes = hours * 60 + minutes
  
  // Market is closed on weekends
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return {
      isOpen: false,
      isPreMarket: false,
      isAfterHours: false,
      isRegularHours: false,
      isWeekend: true,
      nextOpen: getNextMarketOpen(etTime),
      reason: 'Weekend - Markets Closed'
    }
  }
  
  // Define market hours in minutes from midnight
  const preMarketStart = 4 * 60     // 4:00 AM = 240 minutes
  const regularStart = 9 * 60 + 30   // 9:30 AM = 570 minutes
  const regularEnd = 16 * 60         // 4:00 PM = 960 minutes
  const afterHoursEnd = 20 * 60      // 8:00 PM = 1200 minutes
  
  // Check if it's a US holiday (simplified - you may want to expand this)
  if (isMarketHoliday(etTime)) {
    return {
      isOpen: false,
      isPreMarket: false,
      isAfterHours: false,
      isRegularHours: false,
      isWeekend: false,
      isHoliday: true,
      nextOpen: getNextMarketOpen(etTime),
      reason: 'Market Holiday'
    }
  }
  
  // Regular market hours (9:30 AM - 4:00 PM ET)
  if (timeInMinutes >= regularStart && timeInMinutes < regularEnd) {
    return {
      isOpen: true,
      isPreMarket: false,
      isAfterHours: false,
      isRegularHours: true,
      isWeekend: false,
      nextClose: getMarketClose(etTime, false),
      marketPhase: 'Regular Trading Hours'
    }
  }
  
  // Extended hours
  if (includeExtended) {
    // Pre-market (4:00 AM - 9:30 AM ET)
    if (timeInMinutes >= preMarketStart && timeInMinutes < regularStart) {
      return {
        isOpen: true,
        isPreMarket: true,
        isAfterHours: false,
        isRegularHours: false,
        isWeekend: false,
        nextOpen: getRegularMarketOpen(etTime),
        marketPhase: 'Pre-Market Trading'
      }
    }
    
    // After-hours (4:00 PM - 8:00 PM ET)
    if (timeInMinutes >= regularEnd && timeInMinutes < afterHoursEnd) {
      return {
        isOpen: true,
        isPreMarket: false,
        isAfterHours: true,
        isRegularHours: false,
        isWeekend: false,
        nextClose: getMarketClose(etTime, true),
        marketPhase: 'After-Hours Trading'
      }
    }
  }
  
  // Market is closed
  return {
    isOpen: false,
    isPreMarket: false,
    isAfterHours: false,
    isRegularHours: false,
    isWeekend: false,
    nextOpen: getNextMarketOpen(etTime),
    reason: timeInMinutes < preMarketStart ? 'Before Pre-Market' : 'After Hours Closed'
  }
}

/**
 * Check if a date is a US market holiday
 * This is a simplified version - you may want to use a more comprehensive holiday calendar
 */
function isMarketHoliday(date) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1 // JavaScript months are 0-indexed
  const day = date.getDate()
  
  // Major US market holidays (simplified - doesn't account for observed holidays)
  const holidays = [
    { month: 1, day: 1 },   // New Year's Day
    { month: 1, day: 15 },  // MLK Day (approximation - 3rd Monday)
    { month: 2, day: 19 },  // Presidents Day (approximation - 3rd Monday)
    { month: 5, day: 27 },  // Memorial Day (approximation - last Monday)
    { month: 7, day: 4 },   // Independence Day
    { month: 9, day: 2 },   // Labor Day (approximation - 1st Monday)
    { month: 11, day: 28 }, // Thanksgiving (approximation - 4th Thursday)
    { month: 12, day: 25 }  // Christmas
  ]
  
  return holidays.some(h => h.month === month && h.day === day)
}

/**
 * Get the next market open time
 */
function getNextMarketOpen(currentEtTime) {
  const next = new Date(currentEtTime)
  const dayOfWeek = next.getDay()
  
  // If it's Friday after market close or Saturday, next open is Monday
  if (dayOfWeek === 5 && next.getHours() >= 20 || dayOfWeek === 6) {
    next.setDate(next.getDate() + (8 - dayOfWeek)) // Move to Monday
  }
  // If it's Sunday, next open is Monday
  else if (dayOfWeek === 0) {
    next.setDate(next.getDate() + 1)
  }
  // If it's a weekday after 8 PM, next open is tomorrow
  else if (next.getHours() >= 20) {
    next.setDate(next.getDate() + 1)
  }
  
  // Set to 4:00 AM for pre-market open
  next.setHours(4, 0, 0, 0)
  
  return next
}

/**
 * Get the regular market open time (9:30 AM)
 */
function getRegularMarketOpen(currentEtTime) {
  const next = new Date(currentEtTime)
  next.setHours(9, 30, 0, 0)
  return next
}

/**
 * Get the market close time
 */
function getMarketClose(currentEtTime, isExtended) {
  const close = new Date(currentEtTime)
  if (isExtended) {
    close.setHours(20, 0, 0, 0) // 8:00 PM for after-hours
  } else {
    close.setHours(16, 0, 0, 0) // 4:00 PM for regular hours
  }
  return close
}

/**
 * Format time for display
 */
export function formatMarketTime(date) {
  if (!date) return ''
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  })
}

/**
 * Get a friendly message about market status
 */
export function getMarketStatusMessage() {
  const status = getMarketStatus()
  
  if (status.isRegularHours) {
    return `Market Open until ${formatMarketTime(status.nextClose)}`
  }
  
  if (status.isPreMarket) {
    return `Pre-Market - Regular hours at ${formatMarketTime(status.nextOpen)}`
  }
  
  if (status.isAfterHours) {
    return `After-Hours until ${formatMarketTime(status.nextClose)}`
  }
  
  if (status.isWeekend) {
    return `Weekend - Market opens ${formatMarketTime(status.nextOpen)}`
  }
  
  if (status.isHoliday) {
    return `Market Holiday - Opens ${formatMarketTime(status.nextOpen)}`
  }
  
  return `Market Closed - Opens ${formatMarketTime(status.nextOpen)}`
}

/**
 * Calculate refresh interval based on market status
 * @returns {number|null} - Interval in milliseconds or null if no refresh needed
 */
export function getRefreshInterval() {
  const status = getMarketStatus()
  
  if (status.isRegularHours) {
    return 15000 // 15 seconds during regular hours
  }
  
  if (status.isPreMarket || status.isAfterHours) {
    return 30000 // 30 seconds during extended hours
  }
  
  // No refresh when market is closed
  return null
}

/**
 * Check if we should refresh prices
 */
export function shouldRefreshPrices() {
  const status = getMarketStatus(true) // Include extended hours
  return status.isOpen
}