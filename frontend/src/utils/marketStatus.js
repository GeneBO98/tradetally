export function getMarketStatus() {
  const now = new Date()
  const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}))
  
  const day = easternTime.getDay() // 0 = Sunday, 6 = Saturday
  const hour = easternTime.getHours()
  const minute = easternTime.getMinutes()
  const timeInMinutes = hour * 60 + minute
  
  // Market is closed on weekends (Saturday = 6, Sunday = 0)
  if (day === 0 || day === 6) {
    return {
      isOpen: false,
      status: 'Market Closed - Weekend',
      nextOpen: getNextMarketOpen(easternTime)
    }
  }
  
  // Regular trading hours: 9:30 AM - 4:00 PM ET
  const marketOpen = 9 * 60 + 30  // 9:30 AM in minutes
  const marketClose = 16 * 60     // 4:00 PM in minutes
  
  if (timeInMinutes >= marketOpen && timeInMinutes < marketClose) {
    return {
      isOpen: true,
      status: 'Market Open',
      closesAt: `${formatTime(16, 0)} ET`
    }
  }
  
  // Pre-market: 4:00 AM - 9:30 AM ET
  const preMarketStart = 4 * 60   // 4:00 AM in minutes
  if (timeInMinutes >= preMarketStart && timeInMinutes < marketOpen) {
    return {
      isOpen: false,
      status: 'Pre-Market',
      opensAt: `${formatTime(9, 30)} ET`
    }
  }
  
  // After-hours: 4:00 PM - 8:00 PM ET
  const afterHoursEnd = 20 * 60   // 8:00 PM in minutes
  if (timeInMinutes >= marketClose && timeInMinutes < afterHoursEnd) {
    return {
      isOpen: false,
      status: 'After Hours',
      nextOpen: getNextMarketOpen(easternTime)
    }
  }
  
  // Market closed overnight
  return {
    isOpen: false,
    status: 'Market Closed',
    nextOpen: getNextMarketOpen(easternTime)
  }
}

function getNextMarketOpen(easternTime) {
  const tomorrow = new Date(easternTime)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 30, 0, 0)
  
  // If tomorrow is Saturday, next open is Monday
  if (tomorrow.getDay() === 6) {
    tomorrow.setDate(tomorrow.getDate() + 2)
  }
  // If tomorrow is Sunday, next open is Monday  
  else if (tomorrow.getDay() === 0) {
    tomorrow.setDate(tomorrow.getDate() + 1)
  }
  
  return `${formatTime(9, 30)} ET`
}

function formatTime(hours, minutes) {
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours
  const displayMinutes = minutes.toString().padStart(2, '0')
  return `${displayHours}:${displayMinutes} ${period}`
}

export function isMarketOpen() {
  return getMarketStatus().isOpen
}